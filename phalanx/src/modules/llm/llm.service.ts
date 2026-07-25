import { Injectable } from '@nitrostack/core';
import OpenAI from 'openai';

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
 * Thin wrapper over NVIDIA NIM using the OpenAI-compatible API.
 * Model: nvidia/nemotron-3-nano-30b-a3b (streaming → buffered for JSON).
 *
 * If NVIDIA_API_KEY is unset the service reports `available === false` and
 * every caller falls back to its local deterministic analyzer.
 */
@Injectable()
export class LlmService {
  private client: OpenAI | null = null;
  private readonly model: string;

  constructor() {
    this.model = process.env.PHALANX_MODEL ?? 'nvidia/nemotron-3-nano-30b-a3b';

    const apiKey = process.env.NVIDIA_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({
        baseURL: 'https://integrate.api.nvidia.com/v1',
        apiKey,
        timeout: 30_000
      });
    }
  }

  get available(): boolean {
    return this.client !== null;
  }

  get modelId(): string {
    return this.model;
  }

  /**
   * Run a structured-output completion. Returns `null` on any error so
   * callers always fall back to heuristic analysis.
   */
  async json<T>(req: JsonRequest): Promise<T | null> {
    if (!this.client) return null;

    try {
      const systemPrompt =
        req.system +
        '\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown fences, no prose. ' +
        'The JSON must match this schema:\n' +
        JSON.stringify(req.schema, null, 2);

      // Collect the streaming response into a single string
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: req.user }
        ],
        temperature: 1,
        top_p: 1,
        max_tokens: req.maxTokens ?? 16384,
        stream: true
      });

      let raw = '';
      for await (const chunk of stream) {
        const delta = (chunk.choices[0]?.delta as any)?.content;
        if (delta) raw += delta;
      }

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
