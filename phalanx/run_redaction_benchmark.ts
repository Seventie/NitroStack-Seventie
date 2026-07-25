import { RedactionService } from './src/modules/redaction/redaction.service.js';
import { SessionVaultService } from './src/modules/redaction/session-vault.service.js';
import * as dotenv from 'dotenv';
dotenv.config();

const SAMPLE_DOCUMENTS: Array<{ doctype: string; title: string; text: string }> = [
  {
    doctype: 'saas_msa',
    title: 'SaaS Master Service Agreement',
    text: `SAAS MASTER SERVICES AGREEMENT
This Master Services Agreement ("Agreement") is entered into as of October 15, 2024 ("Effective Date") by and between Acme Cloud Technologies Inc. ("Provider"), located at 100 Innovation Way, San Francisco, CA 94105, and Global Financial Systems LLC ("Customer"), with primary contact John Doe at john.doe@globalfin.com or +1 (415) 555-0199.

1. COMMERCIAL TERMS & FEES
The Annual Contract Value (ACV) for the initial term shall be USD $250,000. Customer shall remit payments via Wire Transfer to Chase Bank, Account No. 9876543210, IBAN US64CHAS0000009876543210. Purchase Order number PO-88492 applies to all invoices.

2. GOVERNING LAW & JURISDICTION
This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware. Any disputes shall be submitted to the exclusive jurisdiction of the courts of Delaware.

3. SIGNATURES
Signed by:
Name: Sarah Jenkins
Title: Chief Technology Officer, Acme Cloud Technologies Inc.

Name: Robert Smith
Title: VP of Procurement, Global Financial Systems LLC`
  },
  {
    doctype: 'enterprise_agreement',
    title: 'Enterprise Agreement',
    text: `ENTERPRISE PLATFORM AGREEMENT
This Enterprise Agreement is made between CloudScale Enterprise Systems Inc. ("Vendor") and Apex Global Logistics Corp. ("Customer").

1. PROCUREMENT & SECURITY CONTACTS
Primary Security Contact is David Vance reachable at security.alert@cloudscale.com or phone +1 (800) 555-0190. Purchase Order PO-991823 is mandatory for billing.

2. COMMERCIAL FEES & BANKING
Annual Contract Value (ACV) of USD $1,200,000. Remit to Bank of America, Account No. 4829103948, IBAN US12BOFA00004829103948.

3. GOVERNING LAW
Governed by the laws of the State of New York. Signed by VP Operations Thomas Wright.`
  },
  {
    doctype: 'nda',
    title: 'Mutual Non-Disclosure Agreement',
    text: `MUTUAL NON-DISCLOSURE AGREEMENT
This Mutual Non-Disclosure Agreement is executed between Titan Aerospace Labs Inc. ("Disclosing Party") and Quantum Propulsion Ltd. ("Receiving Party").

1. SCOPE OF CONFIDENTIAL INFORMATION
Confidential Information includes technical specs, trade secrets, and proprietary algorithms designated as Project Codename "HyperIon-V". The proprietary algorithm known as "PlasmaPulse Dynamics" represents core trade secrets.

2. CONTACTS & DURATION
Security contact is Marcus Vance at marcus.vance@titanaero.com. All notices shall be delivered to 450 Rocket Road, Austin, TX 78701.`
  },
  {
    doctype: 'dpa',
    title: 'Data Processing Agreement (GDPR / Privacy)',
    text: `DATA PROCESSING ADDENDUM
This Data Processing Addendum ("DPA") supplements the Main Services Agreement between CyberShield Systems Corp. ("Data Processor") and HealthCare Dynamics Ltd. ("Data Controller").

1. SUB-PROCESSORS & DATA TRANSFER
Data Controller authorizes Data Processor to engage sub-processors including Amazon Web Services Inc. and Snowflake Inc. Data centers are located in Ireland, European Union.
The appointed Data Protection Officer (DPO) is Dr. Aris Thorne reachable at dpo@healthcaredynamics.io or phone +44 20 7946 0912.

2. HIGH-RISK DATA IDENTIFIERS
Customer representative SSN on record: 883-42-9102. Aadhaar card identifier for regional compliance auditor: 4829 1049 5821. PAN number: ABCDE1234F. Contact email: auditor.security@cyber-shield.com.`
  },
  {
    doctype: 'service_agreement',
    title: 'General Services Agreement',
    text: `PROFESSIONAL SERVICES AGREEMENT
This Services Agreement is entered into by Horizon IT Services Consultancy Inc. ("Provider") and Vertex Retail Group LLC ("Client").

1. SERVICES & FEES
Provider shall deliver IT modernization services for a total fee of USD $180,000. Payments sent to Citibank, Account No. 9918204918, IBAN US88CITI0009918204918.

2. NOTICES & GOVERNING LAW
Primary contact Mark Stevens at m.stevens@horizon-it.com, Tel +1 (212) 555-0133. Governed by the laws of the State of Illinois.`
  },
  {
    doctype: 'rental_lease',
    title: 'Rental / Lease Agreement',
    text: `RESIDENTIAL LEASE AGREEMENT
Landlord: Jonathan Michael Carter, 45 Maple Ridge Drive, Springfield, IL 62704 (Email: jonathan.carter@propertymail.example, Phone: +1 217 555 8147, SSN: 984-62-3715).
Tenant: Emily Rose Thompson (Email: emily.thompson98@mail.example, Phone: +1 312 555 9038).

1. TERMS & RENT
Monthly Rent: USD $1,850. Security Deposit: USD $2,500. Remit to First National Community Bank, Account No. 583921470118. Governed by Illinois law.`
  },
  {
    doctype: 'construction_contract',
    title: 'Construction / EPC Contract',
    text: `ENGINEERING, PROCUREMENT AND CONSTRUCTION CONTRACT
Contract between BuildCorp Infrastructure Solutions Inc. ("Contractor") and Horizon Commercial Developments LLC ("Owner").

1. PROJECT SCOPE & LOCATION
Contractor shall execute engineering design for Project Codename "Solaris Heights Commercial Complex". Total Contract Price: USD $28,500,000.

2. BANKING & NOTICES
Payments to Wells Fargo Bank, Account No. 99482019482, Purchase Order PO-EPC-2026-901. Project Director Michael Vance (mvance@buildcorp.example, Tel: +1 713 555 0192). Governed by Texas law.`
  },
  {
    doctype: 'supply_purchase_agreement',
    title: 'Supply / Purchase Agreement',
    text: `MASTER SUPPLY AND PURCHASE AGREEMENT
Between Global Component Suppliers Corp. ("Supplier") and OmniTech Automotive Inc. ("Buyer").

1. SUPPLY & PRICING
Buyer commits to Annual Contract Value (ACV) of USD $3,400,000 under Purchase Order PO-SUP-44918.

2. LOGISTICS & BANKING
Inquiries to order.fulfillment@globalsuppliers.com or +1 (313) 555-0188. Payments wired to HSBC Bank, Account No. 1029384756, IBAN GB99MIDL40051510293847. Governed by Michigan law.`
  },
  {
    doctype: 'manufacturing_agreement',
    title: 'Manufacturing Agreement',
    text: `MASTER MANUFACTURING AGREEMENT
Between Precision Tech Manufacturing Ltd. ("Manufacturer"), PAN AAACP8834K, Pune, India, and Apex Electronics Corp. ("Client"), San Jose, CA, USA.

1. SCOPE & TRADE SECRETS
Manufacturer produces circuit boards under Project Codename "Falcon-X5". Proprietary formula "ThermalBond-V4" is a trade secret.

2. FEES & PAYMENT
Annual Commitment USD $1,450,000. Invoices under PO-MFG-88102 wired to HSBC Bank India, Account No. 042-883920-001. Contacts: Suresh Patel (suresh.patel@precisiontech.example, +91 98230 41928) and Jennifer Miller (j.miller@apexelectronics.example, +1 408 555 0144).`
  },
  {
    doctype: 'licensing_agreement',
    title: 'IP / Licensing Agreement',
    text: `SOFTWARE LICENSE AGREEMENT
Between NeuralEngine AI Systems Inc. ("Licensor") and DataVision Analytics Corp. ("Licensee").

1. LICENSE GRANT & PROPRIETARY CODE
Licensor grants access to Project Codename "Synapse-X" featuring proprietary algorithm "HyperMatrix Tensor Pipeline". Royalty is 5.5% of net sales.

2. NOTICES
Contact legal@neuralengine.ai or +1 (650) 555-0166. Governed by California law.`
  },
  {
    doctype: 'distribution_reseller_agreement',
    title: 'Distribution / Reseller Agreement',
    text: `INTERNATIONAL DISTRIBUTION AGREEMENT
Between CyberWall Security Technologies Inc. ("Principal") and Pacific Rim Distributors Ltd. ("Distributor").

1. TERRITORY & COMMITMENT
Distributor is granted exclusive rights in Japan & South Korea with ACV commitment of USD $750,000.

2. BANKING & CONTACT
Wired to Sumitomo Mitsui Banking Corp, Account No. 884029104. Contact partner.ops@cyberwall.com or +81 3 5555 0149. Governed by Singapore law.`
  },
  {
    doctype: 'loan_financing_agreement',
    title: 'Loan / Financing Agreement',
    text: `SYNDICATED CREDIT FACILITY AGREEMENT
Between Horizon Energy Infrastructure Ltd. ("Borrower") and Barclays Corporate Bank PLC ("Lender").

1. CREDIT FACILITY & COVENANTS
Principal loan amount USD $15,000,000 at SOFR + 2.75%. DSCR covenant minimum 1.25x.

2. BANKING & NOTICES
Drawdown to Citibank N.A., Account No. 8839201948, IBAN GB82CITI18204888392019. Borrower CFO David Sterling (d.sterling@horizonenergy.example, +44 20 7946 0882). Governed by English law.`
  },
  {
    doctype: 'employment_contract',
    title: 'Executive Employment Contract',
    text: `EMPLOYMENT CONTRACT
Between NextGen AI Labs Inc. ("Employer") and Alexander Wright ("Employee"), residing at 742 Evergreen Terrace, Springfield, IL 62704.

1. COMPENSATION & IDENTIFICATION
Employee SSN: 219-00-8472. Personal email: alexander.wright@gmail.com. Phone: +1 312 555 0147.
Base salary $185,000 per annum. Direct deposit to Bank Account No. 44102938475. Governed by Illinois law.`
  },
  {
    doctype: 'partnership_joint_venture',
    title: 'Partnership / Joint Venture Agreement',
    text: `JOINT VENTURE AGREEMENT
Between Apex Energy Ventures Inc. ("Party A") and Terra Solar Technologies Corp. ("Party B").

1. GOVERNANCE & CAPITAL
Parties establish Project Codename "Helios-Solar-Park" with capital contribution of USD $50,000,000. Voting rights allocated 50/50.

2. BANKING & NOTICES
Capital calls deposited to Deutsche Bank, Account No. 7729104829, IBAN DE89370400440772910482. Contact jv.governance@apexterra.com. Governed by Delaware law.`
  },
  {
    doctype: 'general_contract',
    title: 'General Contract (Fallback)',
    text: `GENERAL SERVICE & MAINTENANCE AGREEMENT
Between OmniServices Operations Inc. and Metro Property Holdings LLC.

1. SCOPE & FEES
Maintenance services fee USD $45,000. Deposit to Chase Bank, Account No. 1029485760.

2. CONTACTS
Contact support@omniservices.example or +1 (404) 555-0177. Governed by Georgia law.`
  }
];

async function main() {
  console.log("=========================================================================");
  console.log("   PHALANX REDACTION ENGINE - BENCHMARK & TEST RUNNER (ALL 15 DOMAINS)");
  console.log("=========================================================================");
  
  const vault = new SessionVaultService();
  const service = new RedactionService(vault);

  let passed = 0;
  let failed = 0;
  const summary: Array<{ doctype: string; title: string; tokens: number; clean: boolean; leaks: number }> = [];

  for (const sample of SAMPLE_DOCUMENTS) {
    console.log(`\n-------------------------------------------------------------------------`);
    console.log(` TESTING DOMAIN [${summary.length + 1}/15]: ${sample.title} (doctype: ${sample.doctype})`);
    console.log(`-------------------------------------------------------------------------`);
    
    console.log("\n>>> ORIGINAL TEXT:");
    console.log(sample.text);

    const result = await service.redact(sample.text, sample.doctype, `test_sess_${sample.doctype}`);
    const verification = service.verify(result.redactedText, sample.doctype);

    console.log("\n>>> POLICY & LEGAL PROFILE APPLIED:");
    console.log(`Label: ${result.policy.label}`);
    console.log(`Legal Rules Version: ${result.pipeline.legalRulesVersion}`);
    console.log(`Providers Active: GLiNER=${result.pipeline.providerStatus.nvidiaGLiNER}, HF=${result.pipeline.providerStatus.huggingFace}, SpaCy=${result.pipeline.providerStatus.spacyEndpoint}`);

    console.log("\n>>> DETECTIONS SUMMARY:");
    console.log(`Total Tokens Minted: ${result.stats.totalTokens}`);
    console.log(`Detections breakdown:`, JSON.stringify(result.stats.detections));
    console.log(`Entity Counts:`, JSON.stringify(result.stats.byEntity));

    console.log("\n>>> REDACTED / ANONYMIZED TEXT OUTPUT (LLM Payload):");
    console.log(result.redactedText);

    // Test restoration
    const restored = service.restore(result.redactedText, result.sessionId);
    console.log("\n>>> UNMASKED / RESTORED TEXT (Session Vault Test):");
    console.log(`Restoration Success: ${restored.found}, Substitutions: ${restored.substitutions}`);
    
    console.log("\n>>> PII LEAK VERIFICATION:");
    console.log(`Clean: ${verification.clean}, Residual Leaks: ${verification.leaks.length}`);
    if (!verification.clean) {
      console.log(`Leaks detected:`, JSON.stringify(verification.leaks));
    }

    console.log("\n>>> AUDIT TRAIL SAMPLE:");
    result.pipeline.audit.slice(0, 8).forEach(item => {
      console.log(`  - [${item.action.toUpperCase()}] ${item.entity} (${item.source}): ${item.sample} => ${item.token || 'N/A'}`);
    });

    if (restored.found && verification.clean) {
      passed++;
    } else {
      failed++;
    }

    summary.push({
      doctype: sample.doctype,
      title: sample.title,
      tokens: result.stats.totalTokens,
      clean: verification.clean,
      leaks: verification.leaks.length
    });
  }

  console.log("\n=========================================================================");
  console.log("   BENCHMARK SUMMARY MATRIX - ALL 15 CONTRACT DOMAINS");
  console.log("=========================================================================");
  console.table(summary);

  console.log(`\nRESULTS: ${passed}/15 DOMAINS PASSED PERFECTLY (${failed} FAILURES).`);
  console.log("=========================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

