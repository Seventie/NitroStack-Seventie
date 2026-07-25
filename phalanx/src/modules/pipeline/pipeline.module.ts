import { Module } from '@nitrostack/core';
import { PipelineTools } from './pipeline.tools.js';
import { RiskModule } from '../risk/risk.module.js';

@Module({
  name: 'pipeline',
  imports: [RiskModule],
  providers: [PipelineTools],
  controllers: [PipelineTools]
})
export class PipelineModule {}
