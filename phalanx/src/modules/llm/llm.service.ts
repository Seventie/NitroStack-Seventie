import { Injectable } from '@nitrostack/core';
import Anthropic from '@anthropic-ai/sdk';

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
 * Thin wrapper over the Anthropic Messages API.
 *
 * Contract for the rest of Phalanx: this service is the ONLY place that talks to
 * an external model. Everything passed in here must already be redacted — the
 * unredacted token map never leaves RedactionService's encrypted store.
 *
 * If ANTHROPIC_API_KEY is unset the service reports `available === false` and
 * every caller falls back to its local deterministic analyzer, so the pipeline
 * still runs end to end offline.
 */
@Injectable()
export class LlmService {
  private client: Anthropic | null = null;
  private readonly model: string;
  private readonly defaultEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';

  constructor() {
    this.model = process.env.PHALANX_MODEL || 'claude-opus-5';
    this.defaultEffort =
      (process.env.PHALANX_EFFORT as 'low' | 'medium' | 'high' | 'xhigh' | 'max') || 'high';

    if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
      this.client = new Anthropic();
    }
  }

  get available(): boolean {
    return this.client !== null;
  }

  get modelId(): string {
    return this.model;
  }

  /**
   * Run a structured-output completion. Returns `null` when no model is
   * configured, when the request was refused, or when the response could not be
   * parsed — callers must treat `null` as "use the local fallback".
   */
  async json<T>(req: JsonRequest): Promise<T | null> {
    if (!this.client) return null;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 16000,
        system: req.system,
        output_config: {
          effort: req.effort ?? this.defaultEffort,
          format: { type: 'json_schema', schema: req.schema as any }
        },
        messages: [{ role: 'user', content: req.user }]
      } as any);

      if ((response as any).stop_reason === 'refusal') return null;

      const text = (response.content as any[])
        .filter((block) => block.type === 'text')
        .map((block) => block.text as string)
        .join('')
        .trim();

      if (!text) return null;
      return JSON.parse(text) as T;
    } catch (err) {
      console.warn('[llm] completion failed, falling back to local analysis:', (err as Error).message);
      return null;
    }
  }
}
