import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export async function analyzeDocument(file, contractType) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64Data = e.target.result.split(',')[1];
        
        // 1. Connect to the MCP Server
        const transport = new SSEClientTransport(new URL('http://localhost:3000/sse'));
        const client = new Client({
          name: "phalanx-frontend",
          version: "1.0.0"
        }, {
          capabilities: {}
        });

        await client.connect(transport);
        
        // 2. Ingest Document
        const ingestResult = await client.callTool({
          name: 'ingest_document',
          arguments: {
            file: base64Data,
            filename: file.name
          }
        });
        
        const rawText = ingestResult.content[0].text;
        
        // 3. Redact Document
        const redactResult = await client.callTool({
          name: 'redact_document',
          arguments: {
            text: rawText,
            contractType: contractType || 'SaaS MSA'
          }
        });
        
        const { redactedText } = JSON.parse(redactResult.content[0].text);
        
        // 4. Build Graph
        const graphResult = await client.callTool({
          name: 'build_graph',
          arguments: {
            redactedText: redactedText,
            doctype: contractType || 'saas_msa',
            sessionId: JSON.parse(redactResult.content[0].text).sessionId
          }
        });
        
        const graphData = JSON.parse(graphResult.content[0].text);
        
        // 5. Analyze Risks
        const analyzeResult = await client.callTool({
          name: 'analyze_all_risks',
          arguments: {
            graphId: graphData.graphId
          }
        });
        
        const analyzeData = JSON.parse(analyzeResult.content[0].text);
        
        // 6. Synthesize Redlines (this aggregates and decrypts)
        const synthesizeResult = await client.callTool({
          name: 'generate_redline',
          arguments: {
            graphId: graphData.graphId,
            sessionId: JSON.parse(redactResult.content[0].text).sessionId,
            restore: true
          }
        });
        
        const finalData = JSON.parse(synthesizeResult.content[0].text);
        
        resolve({
          metadata: {
            documentId: 'doc_' + Math.random().toString(36).substr(2, 9),
            fileName: file.name,
            pageCount: 1,
            processingTime: 'Done'
          },
          // From Part 3 (analyze_all_risks):
          findings: analyzeData.findings || [],
          reports: analyzeData.reports || [],
          totalScore: analyzeData.totalScore || 0,
          // From Part 4 (generate_redline):
          redlines: finalData.redlines || [],
          negotiationEmail: finalData.negotiationEmail || null,
          summary: finalData.summary || ''
        });

      } catch (err) {
        console.error("MCP Pipeline Error:", err);
        reject(err);
      }
    };
    reader.readAsDataURL(file);
  });
}
