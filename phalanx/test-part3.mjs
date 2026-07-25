/**
 * Part 3 Only: Multi-Agent Risk Analysis Test
 *
 * Completely skips Parts 1 (Ingest) and 2 (Graph Build).
 * Calls `load_mock_graph` to inject a pre-built SaaS MSA graph directly
 * into the in-memory store, then runs all 4 risk agents against it.
 *
 * Run: node test-part3.mjs
 * Backend: npm run build ; npm start  (in phalanx/)
 */

const BASE_URL = 'http://localhost:3000/mcp';
let sessionId = null;
let requestId = 1;

// ─────────────────────────────────────────────────────────────────────────────
// MCP helpers
// ─────────────────────────────────────────────────────────────────────────────

async function mcpInit() {
  const resp = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: requestId++,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'phalanx-part3-test', version: '2.0.0' }
      }
    })
  });
  const sid = resp.headers.get('mcp-session-id');
  if (sid) sessionId = sid;
  console.log('✅ MCP session started:', sid ?? '(no session id)');
}

async function callTool(toolName, args) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream'
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;

  const resp = await fetch(BASE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0', id: requestId++,
      method: 'tools/call',
      params: { name: toolName, arguments: args }
    })
  });

  const text = await resp.text();

  // SSE: pick the last "data: {...}" line
  let jsonText = text.trim();
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('data: ') && !t.startsWith('data: [DONE]')) {
      jsonText = t.slice(6).trim();
    }
  }

  let json;
  try { json = JSON.parse(jsonText); }
  catch { throw new Error(`Bad JSON from "${toolName}":\n${text.slice(0, 500)}`); }

  if (json.error) throw new Error(`RPC error in "${toolName}": ${JSON.stringify(json.error)}`);
  if (json.result?.isError) {
    const msg = json.result?.content?.[0]?.text ?? 'unknown';
    throw new Error(`Tool "${toolName}" threw: ${msg}`);
  }

  const rawText = json.result?.content?.[0]?.text ?? '';
  try { return JSON.parse(rawText); }
  catch { return { text: rawText }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n🤖 PHALANX — PART 3: MULTI-AGENT RISK ANALYSIS TEST');
  console.log('='.repeat(57));
  console.log('⚡ Mock graph injected directly — no ingest, no graph build\n');

  await mcpInit();

  // ── Step A: Inject pre-built mock graph ──────────────────────────────────
  console.log('\n📦 [Step A] Injecting pre-built SaaS MSA mock graph...');
  const graphResult = await callTool('load_mock_graph', {});

  const graphId = graphResult.graphId;
  if (!graphId) throw new Error('load_mock_graph did not return a graphId: ' + JSON.stringify(graphResult));

  console.log(`✅ Mock graph loaded!`);
  console.log(`   Graph ID  : ${graphId}`);
  console.log(`   Nodes     : ${graphResult.nodeCount}`);
  console.log(`   Edges     : ${graphResult.edgeCount}`);
  console.log(`   Source    : ${graphResult.source}`);

  // ── Step B: Export and inspect ───────────────────────────────────────────
  console.log('\n🗺️  [Step B] Exporting graph to verify structure...');
  const fullGraph = await callTool('get_graph', { graphId });
  const nodes = fullGraph?.export?.nodes ?? [];
  const edges = fullGraph?.export?.edges ?? [];
  console.log(`✅ Graph has ${nodes.length} nodes and ${edges.length} edges`);
  if (nodes.length) {
    console.log('\n   📋 Clause nodes:');
    nodes
      .filter(n => n.attributes?.kind === 'clause')
      .forEach(n => console.log(`   - [${n.attributes?.category}] ${n.key}: "${n.attributes?.heading?.slice(0, 55) ?? ''}"`));
    console.log('\n   🔖 Entity nodes:');
    nodes
      .filter(n => n.attributes?.kind === 'entity')
      .forEach(n => console.log(`   - [${n.attributes?.entityType}] ${n.key}: ${n.attributes?.label}`));
  }

  // ── Step C: Run all 4 risk agents ────────────────────────────────────────
  console.log('\n\n🚨 [Step C] Running all 4 risk agents via analyze_all_risks...\n');
  const allRisks = await callTool('analyze_all_risks', { graphId });

  const score = allRisks.totalScore ?? allRisks.score ?? 'N/A';
  const findings = allRisks.findings ?? [];
  const llmActive = findings.some(f => f.source === 'llm');
  console.log(`✅ Full analysis done!`);
  console.log(`   Total Risk Score : ${score}/100`);
  console.log(`   Total Findings   : ${findings.length}`);
  console.log(`   LLM active?      : ${llmActive ? '✨ YES — NVIDIA GLM-5.2 is responding!' : '🔧 No — heuristic fallback (check NVIDIA_API_KEY)'}`);

  if (findings.length === 0) {
    console.log('\n   ⚠️  No findings returned. Backend may not be querying the graph correctly.');
  } else {
    console.log('\n   🔴 Top findings (by severity):');
    const sorted = [...findings].sort((a, b) => {
      const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
    });
    for (const f of sorted.slice(0, 8)) {
      const icon = { Critical: '🔴', High: '🟠', Medium: '🟡', Low: '🟢' }[f.severity] ?? '⚪';
      console.log(`\n   ${icon} [${f.severity}] [${f.agent ?? 'unknown'}] ${f.title}`);
      console.log(`      ${(f.description ?? '').slice(0, 120)}`);
      if (f.recommendation) console.log(`      → ${f.recommendation.slice(0, 100)}`);
    }
  }

  // ── Step D: Individual agents ─────────────────────────────────────────────
  console.log('\n\n🔬 [Step D] Individual agent breakdown...\n');
  const agents = [
    ['analyze_corporate', '🏢 Corporate Due-Diligence (entities, jurisdiction, assignment)'],
    ['analyze_financial',  '💰 Financial & Renewal Risk (payment, renewal, SLA)'],
    ['analyze_liability',  '⚖️  Liability & Indemnification (liability, indemnity, IP)'],
    ['analyze_privacy',    '🔒 Privacy & Compliance (data protection, confidentiality)'],
  ];

  for (const [tool, label] of agents) {
    try {
      const result = await callTool(tool, { graphId });
      const src = result.source === 'llm' ? '✨ LLM (NVIDIA)' : '🔧 heuristic fallback';
      console.log(`   ${label}`);
      console.log(`      Score: ${result.score ?? 'N/A'}  |  Findings: ${result.findings?.length ?? 0}  |  Source: ${src}`);
      for (const f of (result.findings ?? []).slice(0, 3)) {
        const icon = { Critical: '🔴', High: '🟠', Medium: '🟡', Low: '🟢' }[f.severity] ?? '⚪';
        console.log(`      ${icon} [${f.severity}] ${f.title}`);
      }
      console.log();
    } catch (err) {
      console.log(`   ❌ ${label}\n      FAILED: ${err.message}\n`);
    }
  }

  console.log('='.repeat(57));
  console.log('✅ Part 3 test complete!\n');
}

run().catch(err => {
  console.error('\n❌ FATAL:', err.message);
  process.exit(1);
});
