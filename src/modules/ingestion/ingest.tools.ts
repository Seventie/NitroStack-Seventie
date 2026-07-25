import { ToolDecorator as Tool, ExecutionContext, Injectable } from '@nitrostack/core';
import { z } from 'zod';
import { ParserService } from './parser.service.js';

@Injectable({ deps: [ParserService] })
export class IngestTools {
  constructor(private parserService: ParserService) {}

  @Tool({
    name: 'ingest_document',
    description: 'Ingest a contract document',
    inputSchema: z.object({
      file: z.string().describe('Base64 encoded file content'),
      filename: z.string().describe('Original filename')
    })
  })
  async ingestDocument(input: any, ctx: ExecutionContext) {
    ctx.logger.info('Ingesting document', { filename: input.filename });
    return await this.parserService.parse(input.file, input.filename);
  }
}
