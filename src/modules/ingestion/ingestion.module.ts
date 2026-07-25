import { Module } from '@nitrostack/core';
import { IngestTools } from './ingest.tools.js';
import { ParserService } from './parser.service.js';

@Module({
  name: 'ingestion',
  controllers: [IngestTools],
  providers: [ParserService],
  exports: [ParserService]
})
export class IngestionModule {}
