import { RedactionService } from './src/modules/redaction/redaction.service.js';
import { SessionVaultService } from './src/modules/redaction/session-vault.service.js';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  let text = args[0];
  const doctype = args[1] || 'saas_msa';

  if (!text) {
    console.log(`
Usage:
  npx tsx redact_cli.ts "Your text here..." [doctype]
  npx tsx redact_cli.ts path/to/file.txt [doctype]

Available doctypes:
  saas_msa, dpa, nda, employment_contract, enterprise_agreement,
  rental_lease, construction_contract, supply_purchase_agreement,
  manufacturing_agreement, licensing_agreement, general_contract
`);
    process.exit(0);
  }

  // If argument is a file path, read file content
  if (fs.existsSync(text)) {
    console.log(`Reading text from file: ${text}`);
    text = fs.readFileSync(text, 'utf8');
  }

  console.log("=========================================================================");
  console.log(`   RUNNING REDACTION (doctype: ${doctype})`);
  console.log("=========================================================================");

  const vault = new SessionVaultService();
  const service = new RedactionService(vault);

  const result = await service.redact(text, doctype);

  console.log("\n>>> REDACTED & ANONYMIZED OUTPUT TEXT:");
  console.log(result.redactedText);

  console.log("\n>>> DETECTIONS SUMMARY:");
  console.log(`Tokens Minted: ${result.stats.totalTokens}`);
  console.log(`Detections:`, result.stats.detections);
  console.log(`Entities:`, result.stats.byEntity);

  const restored = service.restore(result.redactedText, result.sessionId);
  console.log("\n>>> UNMASKED / RESTORED TEXT (Session Vault):");
  console.log(restored.restoredText);

  console.log("\n=========================================================================");
}

main().catch(err => {
  console.error("Redaction CLI Error:", err);
  process.exit(1);
});
