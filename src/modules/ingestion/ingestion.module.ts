import { Module } from '@nitrostack/core';
import { ParserService } from './parser.service.js';

@Module({
  name: 'ingestion',
  providers: [ParserService],
  exports: [ParserService]
})
export class IngestionModule {}
