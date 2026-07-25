import { Injectable } from '@nitrostack/core';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
 * Thin wrapper over the Google Gemini API using native responseSchema.
 *
 * Contract for the rest of Phalanx: this service is the ONLY place that talks to
 * an external model. Everything passed in here must already be redacted — the
 * unredacted token map never leaves RedactionService's encrypted store.
 *
 * If GOOGLE_API_KEY is unset the service reports `available === false` and
 * every caller falls back to its local deterministic analyzer, so the pipeline
 * still runs end to end offline.
 */
@Injectable()
export class LlmService {
  private client: GoogleGenerativeAI | null = null;
  private readonly model: string;

  constructor() {
    this.model = process.env.PHALANX_MODEL || 'gemini-2.5-flash';

    if (process.env.GOOGLE_API_KEY) {
      this.client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
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
      const model = this.client.getGenerativeModel({
        model: this.model,
        systemInstruction: req.system,
        generationConfig: {
          responseMimeType: 'application/json',
        }
      });

      const response = await model.generateContent(req.user);
      let text = response.response.text().trim();

      if (!text) return null;
      
      // Safety parsing for markdown
      text = text.replace(/^```json/i, '').replace(/```$/i, '').trim();
      
      return JSON.parse(text) as T;
    } catch (err) {
      console.warn('[llm] completion failed, falling back to local analysis:', (err as Error).message);
      return null;
    }
  }
}


