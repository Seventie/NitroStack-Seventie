import { ToolDecorator as Tool, ExecutionContext } from '@nitrostack/core';
import { z } from 'zod';
import { ClassifierService } from './classifier.service.js';
import { RedactionService } from './redaction.service.js';

export class RedactionTools {
  constructor(
    private classifierService: ClassifierService,
    private redactionService: RedactionService
  ) {}

  @Tool({
    name: 'list_redaction_policies',
    description:
      'List the available contract types and the redaction policy each one applies. Use this to populate a contract-type selector before redacting.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  })
  async listPolicies(_input: any, ctx: ExecutionContext) {
    ctx.logger.info('Listing redaction policies');
    return { policies: this.redactionService.listPolicies() };
  }

  @Tool({
    name: 'classify_document',
    description:
      'Suggest a contract type from the document text. Advisory only — the user selection passed to redact_document always wins.',
    inputSchema: z.object({
      text: z.string().describe('Full text of the document')
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  })
  async classifyDocument(input: any, ctx: ExecutionContext) {
    ctx.logger.info('Classifying document');
    const doctype = await this.classifierService.classify(input.text);
    return { doctype, suggested: true };
  }

  @Tool({
    name: 'redact_document',
    description:
      'Redact a contract under the policy for the selected contract type. Returns the redacted text plus a session id. Original values are held only in an encrypted in-memory store keyed by that session id and are never returned.',
    inputSchema: z.object({
      text: z.string().describe('Full text of the document'),
      doctype: z
        .string()
        .describe('User-selected contract type. Call list_redaction_policies to get supported values.'),
      metadata: z
        .record(z.unknown())
        .optional()
        .describe('Optional document metadata (e.g., author, lastEditedBy) to strip/audit'),
      sessionId: z.string().optional().describe('Reuse an existing session id; omit to mint a new one')
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  })
  async redactDocument(input: any, ctx: ExecutionContext) {
    ctx.logger.info('Redacting document', { doctype: input.doctype });

    const result = await this.redactionService.redact(input.text, input.doctype, input.sessionId, input.metadata);
    const verification = this.redactionService.verify(result.redactedText, result.doctype);

    if (!verification.clean) {
      ctx.logger.warn('Residual PII detected after redaction', { leaks: verification.leaks });
    }

    ctx.logger.info('redaction.completed', {
      sessionId: result.sessionId,
      doctype: result.doctype,
      tokenCount: result.stats.totalTokens
    });

    return { ...result, verification };
  }

  @Tool({
    name: 'restore_text',
    description:
      'Decrypt the session token map and substitute original values back into text. For user-facing output only — never feed the result to a model.',
    inputSchema: z.object({
      text: z.string().describe('Text containing placeholder tokens'),
      sessionId: z.string().describe('Session id returned by redact_document')
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  })
  async restoreText(input: any, ctx: ExecutionContext) {
    ctx.logger.info('Restoring redacted text', { sessionId: input.sessionId });
    return this.redactionService.restore(input.text, input.sessionId);
  }

  @Tool({
    name: 'destroy_session',
    description:
      'Wipe the encrypted token map for a session. Call this after the final report has been delivered to the user.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session id to destroy')
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    }
  })
  async destroySession(input: any, ctx: ExecutionContext) {
    ctx.logger.info('Destroying session vault entry', { sessionId: input.sessionId });
    this.redactionService.destroySession(input.sessionId);
    return { destroyed: true, sessionId: input.sessionId };
  }
}
