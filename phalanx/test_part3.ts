import { LlmService } from './src/modules/llm/llm.service.js';
import { GraphService } from './src/modules/graph/graph.service.js';
import { RiskService } from './src/modules/risk/risk.service.js';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Part 3: Multi-Agent Risk Analysis Test — direct service calls, no HTTP/MCP.
 * Uses a pre-built mock SaaS MSA contract to feed the risk agents directly.
 *
 * Run: npx tsx test_part3.ts
 */

// ─── Mock redacted SaaS MSA ───────────────────────────────────────────────────
const MOCK_CONTRACT = `
1. PAYMENT TERMS
The [CLIENT_NAME_001] shall pay [VENDOR_NAME_001] [ACV_VALUE_001] per annum,
invoiced quarterly within Net 30 days. Late payments shall incur a [PERCENTAGE_001]
monthly interest charge.

2. TERM AND TERMINATION
This Agreement commences on [DATE_001] for an initial term of two years.
Either party may terminate with 60 days written notice.
[VENDOR_NAME_001] may terminate immediately for non-payment after 15 days.

3. AUTO-RENEWAL
This Agreement auto-renews for successive one-year terms unless either party
provides 90 days notice of non-renewal.

4. LIMITATION OF LIABILITY
In no event shall either party be liable for indirect, incidental, or consequential
damages. [VENDOR_NAME_001]'s total aggregate liability shall not exceed the fees
paid in the 3 months prior to the claim.

5. INDEMNIFICATION
[VENDOR_NAME_001] shall defend, indemnify, and hold harmless [CLIENT_NAME_001]
from any third-party claims arising from [VENDOR_NAME_001]'s gross negligence.
[CLIENT_NAME_001] has no reciprocal indemnity obligations.

6. CONFIDENTIALITY
Each party agrees to maintain the other's Confidential Information in strict
confidence for 5 years post-termination.

7. DATA PROTECTION
[VENDOR_NAME_001] shall process personal data only on [CLIENT_NAME_001]'s
documented instructions. In the event of a data breach, [VENDOR_NAME_001] shall
notify [CLIENT_NAME_001] within 72 hours. [VENDOR_NAME_001] may engage
sub-processors at its sole discretion without prior approval.

8. GOVERNING LAW
This Agreement shall be governed by the laws of [JURISDICTION_001].

9. INTELLECTUAL PROPERTY
All work product developed by [VENDOR_NAME_001] under this Agreement remains
exclusively owned by [VENDOR_NAME_001]. [CLIENT_NAME_001] receives a limited,
non-exclusive license to use the deliverables during the term only.

10. ASSIGNMENT
Neither party may assign this Agreement without the other's prior written consent,
except [VENDOR_NAME_001] may assign in connection with a merger without consent.
`;

async function run() {
  console.log('\n🤖 PHALANX — PART 3: MULTI-AGENT RISK ANALYSIS TEST');
  console.log('='.repeat(57));
  console.log('Direct service calls — no HTTP, no MCP, no compilation step\n');

  // ── Bootstrap services (mirrors what the DI container does at runtime) ───
  const llm          = new LlmService();
  const graphService = new GraphService(llm);
  const riskService  = new RiskService(graphService, llm);

  console.log(`LLM available : ${llm.available ? '✅ YES — ' + llm.modelId : '❌ No (heuristic fallback)'}\n`);

  // ── Step 1: Build graph ──────────────────────────────────────────────────
  console.log('📦 [Step 1] Building graph from mock contract (heuristic, instant)...');
  // Use heuristic-only to avoid LLM latency during graph construction
  const graph = graphService.buildHeuristicFromText(MOCK_CONTRACT, 'SaaS MSA', 'test-sess-001');

  console.log(`✅ Graph built!`);
  console.log(`   Graph ID  : ${graph.graphId}`);
  console.log(`   Source    : ${graph.source}`);
  console.log(`   Nodes     : ${graph.nodeCount}`);
  console.log(`   Edges     : ${graph.edgeCount}`);
  console.log(`   Categories: ${JSON.stringify(graph.categories)}\n`);

  // ── Step 2: Run all 4 risk agents ────────────────────────────────────────
  console.log('🚨 [Step 2] Running all 4 risk agents via analyze_all_risks...\n');
  const allRisks = await riskService.runAllAgents(graph.graphId);

  const llmActive = allRisks.findings.some((f: any) => f.source === 'llm');
  console.log(`✅ Full analysis complete!`);
  console.log(`   Total Risk Score : ${allRisks.totalScore}/100`);
  console.log(`   Total Findings   : ${allRisks.findings.length}`);
  console.log(`   LLM active?      : ${llmActive ? '✨ YES' : '🔧 No — heuristic fallback'}\n`);

  console.log(`   Strengths Found  : ${allRisks.strengths?.length || 0}`);
  if (allRisks.scoreBreakdown && Object.keys(allRisks.scoreBreakdown).length > 0) {
    console.log(`   Score Breakdown  : ${JSON.stringify(allRisks.scoreBreakdown)}`);
  }
  console.log();

  if (allRisks.findings.length === 0) {
    console.log('⚠️  No findings returned. Check LLM availability and graph query logic.');
  } else {
    const ICONS: Record<string, string> = { Critical: '🔴', High: '🟠', Medium: '🟡', Low: '🟢' };
    const sorted = [...allRisks.findings].sort((a: any, b: any) => {
      const order: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
    });
    console.log('   Top findings:\n');
    for (const f of sorted.slice(0, 8) as any[]) {
      console.log(`   ${ICONS[f.severity] ?? '⚪'} [${f.severity}] [${f.agent ?? '?'}] ${f.issue || f.title}`);
      if (f.clauseId) console.log(`      📌 Clause ${f.clauseId}${f.page ? ` (Page ${f.page})` : ''}: "${(f.clause ?? '').slice(0, 100)}"`);
      console.log(`      💥 Impact: ${((f.businessImpact || f.description) || '').slice(0, 120)}`);
      if (f.legalReason) console.log(`      ⚖️  Reason: ${f.legalReason}`);
      if (f.recommendation) console.log(`      → Advice: ${f.recommendation.slice(0, 100)}`);
      if (f.confidence != null) console.log(`      Confidence: ${(f.confidence * 100).toFixed(0)}%`);
      console.log();
    }
  }

  // ── Step 3: Individual agents ─────────────────────────────────────────────
  console.log('🔬 [Step 3] Individual agent breakdown:\n');
  const AGENTS: Array<[string, string]> = [
    ['corporate', '🏢 Corporate Due-Diligence'],
    ['financial',  '💰 Financial & Renewal Risk'],
    ['liability',  '⚖️  Liability & Indemnification'],
    ['privacy',    '🔒 Privacy & Compliance'],
  ];

  for (const [key, label] of AGENTS) {
    const report = await riskService.runAgent(key as any, graph.graphId);
    const src = report.source === 'llm' ? '✨ LLM' : '🔧 heuristic';
    console.log(`   ${label}`);
    console.log(`   Score: ${report.score ?? 'N/A'}  |  Findings: ${report.findings?.length ?? 0}  |  ${src}`);
    for (const f of (report.findings ?? []).slice(0, 2) as any[]) {
      const icon = { Critical: '🔴', High: '🟠', Medium: '🟡', Low: '🟢' }[f.severity as string] ?? '⚪';
      console.log(`      ${icon} [${f.severity}] ${f.issue || f.title}`);
    }
    if (report.strengths && report.strengths.length > 0) {
      console.log(`      ✓ Strengths: ${report.strengths.slice(0, 2).join('; ')}`);
    }
    console.log();
  }

  console.log('='.repeat(57));
  console.log('✅ Part 3 test complete!\n');
}

run().catch(console.error);
