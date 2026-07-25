import { LlmService } from './src/modules/llm/llm.service.js';
import { GraphService } from './src/modules/graph/graph.service.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const llm = new LlmService();
  const graphService = new GraphService(llm);

  const mockRedactedText = `
1. Term and Termination.
This Master Service Agreement is entered into by and between [CLIENT_NAME_001] and the Provider.
This Agreement shall commence on [DATE_002] and continue until terminated by either party upon 30 days notice.
Upon termination, all [CLIENT_NAME_001] data shall be deleted.

2. Limitation of Liability.
In no event shall either party's liability exceed [ACV_VALUE_003].
This cap does not apply to confidentiality breaches or indemnification obligations.
  `;

  console.log("Model Available:", llm.available, "Model ID:", llm.modelId);
  console.log("Building graph using Mock Redacted Text...\n");
  
  const result = await graphService.buildFromText(mockRedactedText, 'saas_msa', 'sess_test123');
  
  console.log("--- GRAPH METADATA ---");
  console.log(`Source used: ${result.source}`);
  console.log(`Nodes: ${result.nodeCount}, Edges: ${result.edgeCount}`);
  console.log(`Categories found:`, result.categories);
  
  console.log("\n--- EXPORTED GRAPH JSON ---");
  console.log(JSON.stringify(result.export, null, 2));
}

run().catch(console.error);
