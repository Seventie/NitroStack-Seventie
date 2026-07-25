import { McpApp, Module } from '@nitrostack/core';
import { IngestionModule } from './modules/ingestion/ingestion.module.js';
import { RedactionModule } from './modules/redaction/redaction.module.js';
import { GraphModule } from './modules/graph/graph.module.js';
import { RiskModule } from './modules/risk/risk.module.js';
import { BenchmarkModule } from './modules/benchmark/benchmark.module.js';
import { ContractResources } from './resources/contract.resources.js';

@Module({
  name: 'phalanx-app',
  imports: [IngestionModule, RedactionModule, GraphModule, RiskModule, BenchmarkModule],
  providers: [ContractResources],
  controllers: []
})
export class AppModule {}

McpApp({
  module: AppModule,
  transport: {
    type: 'http',
    http: {
      port: 3000,
      host: '0.0.0.0'
    }
  }
})(AppModule);

