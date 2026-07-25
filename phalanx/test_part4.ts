import { LlmService } from './src/modules/llm/llm.service.js';
import { GraphService } from './src/modules/graph/graph.service.js';
import { RiskService } from './src/modules/risk/risk.service.js';
import { RedlineService } from './src/modules/risk/redline.service.js';
import { RedactionService } from './src/modules/redaction/redaction.service.js';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Part 4: Multi-Agent Redline & Negotiation Email Test — direct service calls.
 * Verifies the professional redlining and negotiation email synthesis engine.
 *
 * Run: npx tsx test_part4.ts
 */

const MOCK_CONTRACT = `
---PAGE_1---
1. PAYMENT TERMS
The [CLIENT_NAME_001] shall pay [VENDOR_NAME_001] [ACV_VALUE_001] per annum,
invoiced quarterly within Net 30 days. Late payments shall incur a [PERCENTAGE_001]
monthly interest charge.

---PAGE_2---
4. LIMITATION OF LIABILITY
In no event shall either party be liable for indirect, incidental, or consequential
damages. [VENDOR_NAME_001]'s total aggregate liability shall not exceed the fees
paid in the 3 months prior to the claim.

5. INDEMNIFICATION
[VENDOR_NAME_001] shall defend, indemnify, and hold harmless [CLIENT_NAME_001]
from any third-party claims arising from [VENDOR_NAME_001]'s gross negligence.
[CLIENT_NAME_001] has no reciprocal indemnity obligations.
`;

async function run() {
  console.log('\n🤖 PHALANX — PART 4: PROFESSIONAL REDLINE & NEGOTIATION EMAIL TEST');
  console.log('='.repeat(68));

  const llm          = new LlmService();
  const graphService = new GraphService(llm);
  const riskService  = new RiskService(graphService, llm);
  const redaction    = new RedactionService();
  const redline      = new RedlineService(riskService, graphService, redaction, llm);

  console.log(`LLM available : ${llm.available ? '✅ YES — ' + llm.modelId : '❌ No (heuristic fallback)'}\n`);

  console.log('📦 [Step 1] Building graph & analyzing risks...');
  const graph = graphService.buildHeuristicFromText(MOCK_CONTRACT, 'SaaS MSA', 'test-sess-001');
  const allRisks = await riskService.runAllAgents(graph.graphId);

  console.log(`✅ Risk analysis complete (${allRisks.findings.length} findings found)\n`);

  console.log('✏️ [Step 2] Generating professional redlines & negotiation email via synthesize...');
  const proposal = await redline.synthesize(graph.graphId, 'test-sess-001', {
    findings: allRisks.findings,
    restore: false
  });

  console.log('✅ Synthesis complete!\n');
  console.log('─── SUMMARY ───');
  console.log(proposal.summary);
  console.log(`Risk Score: ${proposal.riskScore}/100\n`);

  console.log('─── GENERATED REDLINES ───');
  for (const r of proposal.redlines) {
    console.log(`🔹 [Priority: ${r.priority}] [Severity: ${r.severity}] ${r.category} - ${r.title || 'Revision'}`);
    console.log(`   Original   : "${(r.originalText || '').slice(0, 80)}..."`);
    console.log(`   Suggested  : "${(r.proposedText || '').slice(0, 80)}..."`);
    console.log(`   Reason     : ${r.reason || 'N/A'}`);
    console.log(`   Negotiation: ${r.negotiationPosition || 'N/A'}`);
    if (r.dependencyWarning) console.log(`   ⚠️ Warning  : ${r.dependencyWarning}`);
    console.log();
  }

  console.log('─── NEGOTIATION EMAIL ───');
  console.log(`Subject: ${proposal.negotiationEmail?.subject}\n`);
  console.log(proposal.negotiationEmail?.body);
  console.log('='.repeat(68));
  console.log('✅ Part 4 test complete!\n');
}

run().catch(console.error);
