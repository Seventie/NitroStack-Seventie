import { Injectable } from '@nitrostack/core';

export interface JsonRequest {
  /** System prompt — role, domain constraints, output discipline. */
  system: string;
  /** User prompt — the redacted material plus the concrete task. */
  user: string;
  /** JSON Schema the response is constrained to. */
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

/**
 * Thin wrapper over the NVIDIA NIM API for structured LLM generation.
 *
 * Contract for the rest of Phalanx: this service is the ONLY place that talks to
 * an external model. Everything passed in here must already be redacted — the
 * unredacted token map never leaves RedactionService's encrypted store.
 *
 * If NVIDIA_API_KEY is unset the service reports `available === false` and
 * every caller falls back to its local deterministic analyzer, so the pipeline
 * still runs end to end offline.
 */
@Injectable()
export class LlmService {
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.model = process.env.PHALANX_MODEL || 'nvidia/nemotron-3-nano-30b-a3b';
    this.apiKey = process.env.NVIDIA_API_KEY || process.env.NVIDIA_GLINER_API_KEY || '';
  }

  get available(): boolean {
    return this.apiKey.length > 0;
  }

  get modelId(): string {
    return this.model;
  }

  /**
   * Run a structured-output completion. Returns `null` on any error so
   * callers always fall back to heuristic analysis.
   */
  async json<T>(req: JsonRequest): Promise<T | null> {
    if (!this.available) return null;

    try {
      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { 
              role: 'system', 
              content: req.system + '\n\nIMPORTANT: You MUST respond with ONLY valid JSON matching this schema. Do not wrap in markdown or add explanations.\nSCHEMA:\n' + JSON.stringify(req.schema) 
            },
            { role: 'user', content: req.user }
          ],
          response_format: { type: 'json_object' },
          max_tokens: req.maxTokens || 2048,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`NVIDIA API Error: ${response.status} ${await response.text()}`);
      }

      const data = await response.json();
      let raw = (data.choices[0]?.message?.content || '').trim();

      raw = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/,      '')
        .replace(/\s*```$/,      '')
        .trim();

      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn('[llm] completion failed, falling back to local analysis:', (err as Error).message);
      return null;
    }
  }
}
