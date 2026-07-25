import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const SERVER_URL = 'http://localhost:3000/sse';

function parseToolPayload(result) {
  const raw = result?.content?.[0]?.text;
  if (typeof raw !== 'string') {
    throw new Error('Tool response did not contain text content');
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { text: raw };
  }
}

async function createClient() {
  const transport = new SSEClientTransport(new URL(SERVER_URL));
  const client = new Client(
    {
      name: 'phalanx-frontend',
      version: '1.0.0'
    },
    {
      capabilities: {}
    }
  );
  await client.connect(transport);
  return client;
}

export async function listRedactionPolicies() {
  try {
    const client = await createClient();
    const result = await client.callTool({
      name: 'list_redaction_policies',
      arguments: {}
    });
    return parseToolPayload(result);
  } catch (err) {
    console.warn('Failed to fetch policies from MCP server:', err);
    return null;
  }
}

export async function restoreText(text, sessionId) {
  const client = await createClient();
  const result = await client.callTool({
    name: 'restore_text',
    arguments: { text, sessionId }
  });
  return parseToolPayload(result);
}

export async function classifyDocument(text) {
  try {
    const client = await createClient();
    const result = await client.callTool({
      name: 'classify_document',
      arguments: { text }
    });
    return parseToolPayload(result);
  } catch (err) {
    console.warn('Document classification failed:', err);
    return null;
  }
}

export async function analyzeDocument(file, contractType, onPhaseChange) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64Data = e.target.result.split(',')[1];
        const client = await createClient();

        // 1. Ingest Document (Phase 0)
        if (onPhaseChange) onPhaseChange(0);
        const ingestResult = await client.callTool({
          name: 'ingest_document',
          arguments: {
            file: base64Data,
            filename: file.name
          }
        });

        const ingestPayload = parseToolPayload(ingestResult);
        const rawText = ingestPayload.text || '';

        if (!rawText || typeof rawText !== 'string') {
          throw new Error('Ingestion returned no parseable text');
        }

        // 2. Redact Document (Phase 1)
        if (onPhaseChange) onPhaseChange(1);
        const redactResult = await client.callTool({
          name: 'redact_document',
          arguments: {
            text: rawText,
            doctype: contractType || 'saas_msa',
            metadata: {
              filename: file.name,
              mimeType: file.type,
              size: file.size,
              lastModified: file.lastModified
            }
          }
        });

        const redactPayload = parseToolPayload(redactResult);
        const redactedText = redactPayload.redactedText;
        const redactionSessionId = redactPayload.sessionId;

        if (!redactedText || !redactionSessionId) {
          throw new Error('Redaction returned an invalid payload');
        }

        // 3. Build Graph (Phase 2)
        if (onPhaseChange) onPhaseChange(2);
        const graphResult = await client.callTool({
          name: 'build_graph',
          arguments: {
            redactedText: redactedText,
            doctype: contractType || 'saas_msa',
            sessionId: redactionSessionId
          }
        });

        const graphData = parseToolPayload(graphResult);

        // 4. Analyze Risks (Phase 3)
        if (onPhaseChange) onPhaseChange(3);
        const analyzeResult = await client.callTool({
          name: 'analyze_all_risks',
          arguments: {
            graphId: graphData.graphId
          }
        });
        const analyzePayload = parseToolPayload(analyzeResult);

        // 5. Synthesize Redlines & Benchmark Validation (Phase 4)
        if (onPhaseChange) onPhaseChange(4);
        const synthesizeResult = await client.callTool({
          name: 'generate_redline',
          arguments: {
            graphId: graphData.graphId,
            sessionId: redactionSessionId,
            restore: true
          }
        });

        const finalData = parseToolPayload(synthesizeResult);

        resolve({
          metadata: {
            documentId: 'doc_' + Math.random().toString(36).substr(2, 9),
            fileName: file.name,
            pageCount: ingestPayload.pages?.length || 1,
            processingTime: 'Done',
            risk: {
              analyzed: Boolean(analyzePayload)
            }
          },
          redaction: redactPayload,
          findings: finalData.findings || []
        });

      } catch (err) {
        console.error('MCP Pipeline Error:', err);
        reject(err);
      }
    };
    reader.readAsDataURL(file);
  });
}
