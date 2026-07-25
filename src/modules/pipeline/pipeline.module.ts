import { Module } from '@nitrostack/core';
import { PipelineTools } from './pipeline.tools.js';
import { RiskModule } from '../risk/risk.module.js';
import { GraphModule } from '../graph/graph.module.js';
import { RedactionModule } from '../redaction/redaction.module.js';

@Module({
  name: 'pipeline',
  imports: [RiskModule, GraphModule, RedactionModule],
  providers: [PipelineTools],
  controllers: [PipelineTools]
})
export class PipelineModule {}
