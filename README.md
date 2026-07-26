# Phalanx MCP Server — Secure Legal Document Intelligence

[![NitroStack](https://img.shields.io/badge/Built%20with-NitroStack-0052FF?style=for-the-badge)](https://nitrostack.ai)
[![MCP Protocol](https://img.shields.io/badge/Protocol-MCP%202025--06--18-4B32C3?style=for-the-badge)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

Phalanx is a **privacy-first Model Context Protocol (MCP) server** that equips any MCP-compatible AI assistant (including ChatGPT, Claude, and NitroStudio) with secure, domain-aware legal document intelligence.

---

## 🚨 The Problem Statement

Every day, individuals and organizations sign legally binding documents such as NDAs, rental agreements, employment contracts, loan agreements, vendor contracts, and service agreements. These documents often contain complex legal language, hidden obligations, and unfair clauses that are difficult to identify without expensive legal expertise.

Although AI can assist with document review, two major challenges remain: **(1)** legal documents contain highly sensitive personal and business information that should not be exposed to cloud AI, and **(2)** traditional LLMs often miss relationships between clauses spread across long documents, resulting in incomplete risk analysis.

---

## 🛡️ Our Solution – Phalanx MCP Server

Phalanx is a **privacy-first Model Context Protocol (MCP) server** that equips any MCP-compatible AI assistant with secure legal document intelligence.

Instead of generic PII masking, Phalanx uses **policy-driven P2 redaction**. It supports **15+ legal document types** (NDAs, rental, loan, employment, SaaS, DPAs, vendor agreements, etc.), each with predefined privacy policies that determine exactly what should be anonymized while preserving the context required for accurate AI analysis.

Phalanx then converts contracts into a **Clause Knowledge Graph**, enabling specialized AI agents for **Corporate, Liability, Privacy, and Financial** analysis to work together. The system produces an **overall contract risk score**, clause-level findings, missing or conflicting terms, a concise executive summary, and even a ready-to-send negotiation email recommending changes before signing.

---

## 🌍 Social Impact & Open Innovation

Phalanx helps people make informed decisions before signing important documents by providing secure, explainable, and actionable contract analysis—not just summaries. It empowers individuals, freelancers, startups, enterprises, HR, procurement, compliance, and legal teams while protecting confidential information.

As an **open, domain-agnostic MCP server**, Phalanx can be integrated into any MCP-compatible AI assistant and applied across industries including legal, finance, healthcare, education, insurance, government, and real estate, making secure document intelligence accessible to everyone.

---

## 📊 Architecture & Pipeline Flow Diagram

```
+---------------------------------------------------------------------------------------------------+
|                                      PHALANX PIPELINE FLOW                                        |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [ Raw Document / URL / Base64 ]                                                                  |
|         │                                                                                         |
|         ▼                                                                                         |
|  1️⃣ INGESTION & CLASSIFICATION (classify_document)                                                |
|         │                                                                                         |
|         ▼                                                                                         |
|  2️⃣ POLICY-DRIVEN P2 REDACTION (redact_document)                                                  |
|         │──► Encrypted Token Store (Session Vault, Local & Secure)                                |
|         │                                                                                         |
|         ▼                                                                                         |
|  3️⃣ CLAUSE KNOWLEDGE GRAPH (build_graph)                                                          |
|         │──► Builds structural dependencies & identifies clause relationships                      |
|         │                                                                                         |
|         ▼                                                                                         |
|  4️⃣ SPECIALIZED RISK AGENTS (analyze_all_risks)                                                   |
|         ├──► Corporate Agent   (governance, authority, IP)                                        |
|         ├──► Financial Agent   (fees, payment terms, caps)                                        |
|         ├──► Liability Agent   (indemnity, warranties, damages)                                   |
|         └──► Privacy Agent     (data protection, DPA, GDPR)                                       |
|         │                                                                                         |
|         ▼                                                                                         |
|  5️⃣ SYNTHESIS & NEGOTIATION READY REPORT                                                          |
|         ├──► Overall Risk Score (0 - 100)                                                         |
|         ├──► Clause-by-Clause Findings & Redlines                                                 |
|         └──► Ready-to-Send Negotiation Email                                                      |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

<!-- [SPACE FOR CUSTOM VISUAL FLOW DIAGRAM IMAGE] -->
<!-- Add your visual diagram image below: -->
<!-- ![Phalanx Flow Diagram](./docs/flow-diagram.png) -->

---

## 🚀 Setup & Installation

### 1. Prerequisites
- **Node.js** v20.x or higher
- **npm** v10.x or higher
- (Optional) **NVIDIA NIM / Llama 3.1 API Key** for LLM generation (works offline with deterministic fallback if unset)

### 2. Clone & Install
```bash
git clone https://github.com/Seventie/NitroStack-Seventie.git
cd NitroStack-Seventie
npm install
```

### 3. Environment Configuration
Create a `.env` file in the project root:
```env
# Optional: NVIDIA NIM API Key for structured LLM analysis
NVIDIA_API_KEY=your_nvidia_api_key_here
PHALANX_MODEL=meta/llama-3.1-8b-instruct

# Server configuration
PORT=3000
MCP_TRANSPORT_TYPE=dual
```

### 4. Running Locally
```bash
# Start in development mode with live reload
npm run dev

# Build and start in production mode
npm run build
npm start
```

---

## ☁️ Cloud Deployment & ChatGPT Plugin Integration

Phalanx is built for seamless deployment on **NitroStack Cloud**, Docker, and custom GPT integrations:

- **Streamable HTTP Endpoint**: `http://<your-host>:3000/mcp`
- **Legacy SDK SSE Endpoint**: `http://<your-host>:3000/sse`
- **Readiness Probes**: Supports `GET /`, `GET /health`, and `GET /api/health` returning `200 OK` JSON for container orchestration and load balancers.

### Integrating with ChatGPT (Custom GPT / OpenAPI)
1. In ChatGPT, create a new Custom GPT and add an **Action**.
2. Point the action URL to your deployed Phalanx HTTP server.
3. ChatGPT can execute `run_full_pipeline` directly by passing either raw text, a file URL, or a base64-encoded PDF/Word document.

---

## 🛠️ Complete Tool Reference (21 Tools)

Phalanx exposes **21 specialized MCP tools** across 7 domain modules:

### 📄 1. Document Classification & Redaction (`RedactionModule`)
| Tool | Description |
| :--- | :--- |
| `classify_document` | Automatically classifies a contract into one of 15+ legal document types (NDA, SaaS, DPA, Employment, Rental, etc.). |
| `list_redaction_policies` | Lists available P2 redaction policies and privacy rules for each supported legal contract type. |
| `redact_document` | Redacts sensitive PII and business secrets based on contract policy. Returns sanitized text + `sessionId`. Supports text, URL, or base64. |
| `restore_text` | Replaces redacted tokens with their original text using a valid encrypted `sessionId`. |
| `destroy_session` | Permanently deletes the token mapping for a `sessionId` from secure storage. |

### 🕸️ 2. Clause Knowledge Graph (`GraphModule`)
| Tool | Description |
| :--- | :--- |
| `build_graph` | Constructs a Clause Knowledge Graph from redacted text, mapping clauses and dependencies. |
| `get_graph` | Retrieves the full structured knowledge graph for a given `graphId`. |
| `query_graph` | Queries the knowledge graph for specific clauses, types, or cross-clause dependencies. |
| `get_clause_dependents` | Finds all clauses that depend on or reference a specific target clause ID. |

### ⚖️ 3. Multi-Agent Risk Analysis (`RiskModule`)
| Tool | Description |
| :--- | :--- |
| `list_risk_agents` | Lists the 4 specialized risk agents and their analytical domains. |
| `analyze_corporate` | Runs the **Corporate Agent** to detect governance, signatory authority, and IP ownership risks. |
| `analyze_financial` | Runs the **Financial Agent** to evaluate payment schedules, late fees, penalties, and liability caps. |
| `analyze_liability` | Runs the **Liability Agent** to analyze indemnities, warranties, termination rights, and damages. |
| `analyze_privacy` | Runs the **Privacy Agent** to audit GDPR, CCPA, data ownership, and DPA compliance. |
| `analyze_all_risks` | Runs all four risk agents concurrently on a knowledge graph and synthesizes their findings. |

### ✍️ 4. Redlines & Benchmarking (`BenchmarkModule` & Redlines)
| Tool | Description |
| :--- | :--- |
| `generate_redline` | Generates fair, market-standard replacement language for an unfair or risky clause. |
| `diff_clause` | Compares an original clause with a proposed redline and highlights exact differences. |
| `benchmark_clause` | Compares a clause against industry standard benchmarks for that contract type. |

### 🚀 5. End-to-End Orchestration (`PipelineModule`)
| Tool | Description |
| :--- | :--- |
| `run_full_pipeline` | **Recommended primary tool.** Runs the entire Phalanx pipeline in a single invocation: ingestion → P2 redaction → graph building → 4-agent risk analysis → synthesis. Returns the risk score, breakdown, executive summary, clause redlines, and a **ready-to-send negotiation email**. |

### 🧮 6. Utilities & UI Widgets (`CalculatorModule`)
| Tool | Description |
| :--- | :--- |
| `calculate` | Demonstrates interactive NitroStack UI widgets for mathematical calculations. |
| `convert_temperature` | Helper utility for unit and temperature conversion. |

---

## 📦 Available Resources & Prompts

### Resources
- `contract://{id}/graph`: Inspect the generated Knowledge Graph for a contract.
- `contract://{id}/risks`: Retrieve the full risk assessment report for a contract.
- `health://checks`: Live system health, memory, and container status.
- `calculator://operations`: Available mathematical operations for widgets.

### Prompts
- `calculator_help`: Interactive assistance for widget usage.

---

## 📖 Usage Guide & Example Workflow

### Standard One-Step Pipeline (Best for ChatGPT / AI Assistants)
To analyze any document in one step, invoke **`run_full_pipeline`**:
```json
{
  "contractType": "rental_agreement",
  "text": "THIS LEASE AGREEMENT is made between..."
}
```

**Response Output:**
```json
{
  "documentId": "graph-abc12345",
  "sessionId": "session-xyz789",
  "contractType": "rental_agreement",
  "riskScore": 68,
  "summary": "This rental agreement imposes significant late fee risks...",
  "negotiationEmail": "Dear Landlord,\n\nThank you for sharing the lease agreement...",
  "redlines": [
    {
      "findingId": "finding-1",
      "clauseId": "clause-3",
      "originalText": "Late fee of $50 plus $10/day...",
      "proposedText": "Late fee capped at 5% of monthly rent...",
      "rationale": "Aligns with standard residential leasing regulations."
    }
  ],
  "findings": []
}
```

---

## 📄 License
This project is licensed under the **MIT License**.
