import { RedactionService } from './src/modules/redaction/redaction.service.js';
import { SessionVaultService } from './src/modules/redaction/session-vault.service.js';
import { GraphService } from './src/modules/graph/graph.service.js';
import { RiskService } from './src/modules/risk/risk.service.js';
import { LlmService } from './src/modules/llm/llm.service.js';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const vault = new SessionVaultService();
  const redactionService = new RedactionService(vault);
  const llmService = new LlmService();
  const graphService = new GraphService(llmService);
  const riskService = new RiskService(graphService, llmService);

  const rawText = fs.readFileSync('temp_rental.txt', 'utf8');

  console.log("1. Redacting document...");
  const redaction = await redactionService.redact(rawText, 'rental_lease');

  console.log("2. Building Knowledge Graph...");
  const graph = await graphService.buildFromText(redaction.redactedText, 'rental_lease', redaction.sessionId);

  console.log("3. Running Multi-Agent Risk Subgraph Analysis...");
  const riskAnalysis = await riskService.runAllAgents(graph.graphId);

  console.log("\n=========================================================================");
  console.log("   MULTI-AGENT SUBGRAPH RISK ANALYSIS RESULTS");
  console.log("=========================================================================");
  console.log(`Master Graph ID: ${riskAnalysis.graphId}`);
  console.log(`Overall Risk Exposure Score: ${riskAnalysis.totalScore} / 100`);
  console.log(`Total Agents Run: ${riskAnalysis.reports.length}`);

  console.log("\n>>> SUBGRAPH AGENT REPORTS:");
  riskAnalysis.reports.forEach(report => {
    console.log(`\n• [${report.label}] (${report.agent}):`);
    console.log(`  Clauses Examined in Subgraph: ${report.clausesExamined}`);
    console.log(`  Agent Score: ${report.score}`);
    console.log(`  Findings Count: ${report.findings.length}`);
    
    report.findings.slice(0, 3).forEach(f => {
      console.log(`    - [${f.severity.toUpperCase()}] ${f.title} (${f.category})`);
      console.log(`      Description: ${f.description}`);
      console.log(`      Recommendation: ${f.recommendation}`);
    });
  });

  console.log("\n=========================================================================");
}

main().catch(console.error);
