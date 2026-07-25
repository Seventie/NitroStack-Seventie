import { RedactionService } from './src/modules/redaction/redaction.service.js';
import { SessionVaultService } from './src/modules/redaction/session-vault.service.js';
import { GraphService } from './src/modules/graph/graph.service.js';
import { LlmService } from './src/modules/llm/llm.service.js';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const vault = new SessionVaultService();
  const redactionService = new RedactionService(vault);
  const llmService = new LlmService();
  const graphService = new GraphService(llmService);

  const rawText = fs.readFileSync('temp_rental.txt', 'utf8');
  
  console.log("1. Redacting raw document...");
  const redactResult = await redactionService.redact(rawText, 'rental_lease');
  
  console.log("2. Building Knowledge Graph from REDACTED text payload...");
  const graphResult = await graphService.buildFromText(
    redactResult.redactedText,
    'rental_lease',
    redactResult.sessionId
  );

  console.log("\n=========================================================================");
  console.log("   KNOWLEDGE GRAPH GENERATION RESULTS");
  console.log("=========================================================================");
  console.log(`Graph ID: ${graphResult.graphId}`);
  console.log(`Source Generator: ${graphResult.source}`);
  console.log(`Node Count: ${graphResult.nodeCount} | Edge Count: ${graphResult.edgeCount}`);
  console.log(`Categories Extracted:`, graphResult.categories);

  console.log("\n>>> SAMPLE GRAPH CLAUSE NODES & TOKENS:");
  const exported = graphResult.export;
  exported.nodes.slice(0, 5).forEach((node: any) => {
    console.log(`\n- NODE [${node.key}] (Kind: ${node.attributes.kind}):`);
    if (node.attributes.kind === 'clause') {
      console.log(`  Heading: ${node.attributes.heading}`);
      console.log(`  Category: ${node.attributes.category}`);
      console.log(`  Tokens Bound:`, node.attributes.tokens);
    } else {
      console.log(`  Label: ${node.attributes.label}`);
      console.log(`  Type: ${node.attributes.entityType}`);
    }
  });

  console.log("\n>>> SAMPLE GRAPH EDGES:");
  exported.edges.slice(0, 5).forEach((edge: any) => {
    console.log(`  Edge: ${edge.source} --(${edge.attributes.relation})--> ${edge.target} ${edge.attributes.note ? '(' + edge.attributes.note + ')' : ''}`);
  });

  console.log("=========================================================================");
}

main().catch(console.error);
