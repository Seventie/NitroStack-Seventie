# Phalanx — AI Contract Risk Analyst (NitroStack-only MCP Server)

## One-line pitch
Phalanx is an MCP server, built entirely on the **NitroStack SDK**, that ingests any contract (typed PDF, scanned PDF, or DOCX), redacts sensitive data locally, builds a knowledge graph of its clauses, runs specialized risk-analysis agents against that graph, and benchmarks flagged clauses against industry-standard terms — all before anything reaches an external LLM.

## Hard constraints (read first)
1. Every server-side capability — tools, resources, prompts, auth, widgets — must be implemented using the **NitroStack SDK** (`@nitrostack/core`, decorator-based, TypeScript) and tested/debugged in **NitroStudio**. Do not introduce a second agent-orchestration framework (no LangChain, CrewAI, AutoGen, etc.). Each "agent" described below is a NitroStack `@Tool`-bearing class, composed via NitroStack's dependency injection, not a separate framework's agent object. Anything that isn't natively supported by NitroStack (OCR, NER, vector search, graph storage) is plugged in as a plain TypeScript service injected into NitroStack tools — not as a competing framework.
2. **PII must stay fully local, all models included.** This mirrors the SprintFour project exactly: no PII/contract text leaves the machine for classification, redaction, entity extraction, or embedding. Only the already-redacted, tokenized text may ever be sent to an external LLM (and only in Phase 3, if you choose to use one for redline drafting — see open items).
3. **Reuse the SprintFour UI as-is**, not a new design. The frontend for Phalanx should visually and structurally match the existing SprintFour local-first PII app (same component library, same layout patterns, same color/theme tokens, same upload/results screen conventions) so the two projects feel like one continuous product, just with Phalanx's added phases (OCR, graph, multi-agent risk, benchmark) layered into that shell.
4. **Everything must be deployable, not just demo-able locally.** Structure the NitroStack server and the frontend as two independently deployable units (server → NitroCloud or any Node host; frontend → static hosting), with env-based config (ports, storage paths, model paths) so a judge or teammate can spin the whole thing up from a clean clone without hardcoded local paths.

---

## Phase 0 — OCR & Ingestion Layer *(new)*

**Goal:** Guarantee every uploaded document produces clean, extractable text before classification/redaction, regardless of whether it's a native PDF, a scanned/image-based PDF, a photographed contract, or a DOCX.

1. **Upload tool:** A NitroStack `@Tool` (`ingest_document`) accepts a base64 file payload + filename, writes it to local scratch storage, and detects file type (`pdf`, `docx`, `image`).
2. **Native text extraction path:** For text-native PDFs/DOCX, extract directly with `pdfplumber`/`PyPDF2`-equivalent or `mammoth`/`docx` parsing (Node-native libs, since NitroStack is TS-first — e.g. `pdf-parse` or `docx` npm packages).
3. **OCR fallback path:** If native extraction yields low text density (e.g. < ~20 characters per page, a common signal of a scanned page), route the page images through an OCR engine — **Tesseract.js** for a fully local, no-API-key pipeline (keeps the "local-first" property from your SprintFour PII project), or a cloud OCR API only if you explicitly want higher accuracy and are OK sending images externally.
4. **Page rasterization:** Use `pdf-to-img` or `pdf-poppler` to rasterize PDF pages to PNG before handing them to Tesseract.
5. **Confidence & mixed-mode handling:** Some contracts have a native cover page plus scanned signature pages — extract per-page, tag each page's source (`native` vs `ocr`) and OCR confidence score, and merge into one ordered document object.
6. **Output contract:** `{ documentId, pages: [{ pageNumber, text, source, ocrConfidence }], fullText }` — this is what Phase 1 consumes.

---

## Phase 1 — Adaptive Redaction (PII/PCI Layer)

**Goal:** Identify document type and scrub sensitive data locally before any text reaches an LLM.

1. **Document Classification Tool:** Feed the first ~500 tokens of `fullText` to a fast local or lightweight-LLM classifier tool (`classify_document`) to tag the doc as SaaS MSA, Enterprise Agreement, NDA, DPA, etc.
2. **Redaction Policy Schema:** A local JSON/YAML config per document type defining what must be masked vs. preserved (e.g., NDAs scrub trade secrets/code names; MSAs scrub ACV and banking details but keep legal entity names).
3. **Adapt the SprintFour PII layer:** Port the existing local-first PII detection module from your SprintFour project into a NitroStack service (`RedactionService`), injected into a `redact_document` tool. Extend its input path to accept the Phase 0 OCR output (it currently assumes clean, non-OCR'd text — add tolerance for OCR noise/typos in regex matching, e.g. fuzzy matching on SSN/phone patterns).
4. **Hybrid redaction pass:** Regex for structured PII (emails, phone numbers, SSNs, tax IDs) + NER/LLM-based token masking for financial figures and proprietary identifiers.
5. **Reversible tokens:** Replace sensitive spans with typed placeholders (`[CLIENT_NAME]`, `[ACV_VALUE]`, `[JURISDICTION]`) and persist the original↔token map in a local encrypted key-value store (e.g. `better-sqlite3` with field-level encryption, or `keytar`-backed secrets) so final reports can be de-redacted for the user only, never for the LLM.

---

## Phase 2 — Knowledge Graph Construction

**Goal:** Turn linear contract text into a queryable relational structure so agents traverse dependencies instead of hallucinating over raw strings.

1. **Chunking & entity extraction tool (`build_graph`):** Split redacted text into semantic paragraphs; extract entities via a lightweight NLP pass (e.g. `compromise` or `wink-nlp` for a pure-Node pipeline, or a local LLM call with a strict extraction schema).
2. **Graph schema:**
   - *Nodes:* Parties, Effective Date, Governing Law, Clause blocks.
   - *Edges:* Obligations (payment terms, notice periods, indemnity triggers) and dependencies (e.g. `Termination → triggers → Data Deletion`).
3. **Persistence:** Store the graph locally with `graphology` or `NetworkX`-equivalent (Node: `graphology` + `graphology-graphml`), exposed to other tools via a NitroStack `@Resource` so agents query it rather than re-parsing text.

---

## Phase 3 — Multi-Agent Graph Query & Risk Analysis

**Goal:** Role-scoped NitroStack tools that each query only their relevant sub-graph, score risk, and draft redlines.

1. **Specialized tool classes** (each a NitroStack `@Tool`-decorated method, not a separate agent framework):
   - `FinancialRenewalTool` — payment terms, auto-renewal windows, pricing escalation.
   - `LiabilityIndemnityTool` — liability caps, asymmetric indemnities, consequential-damage exclusions.
   - `PrivacyDPATool` — data processing obligations, sub-processor rights, portability terms.
2. **Risk scoring:** Each tool evaluates its extracted sub-graph against a rules/threshold config and returns `{ clause, severity: Critical|High|Medium|Low, explanation }`.
3. **Redline & rewriter tool:** Cross-references the graph before proposing alternate phrasing, ensuring a redline doesn't break a dependent definition elsewhere in the contract. Outputs a structured counter-proposal plus a vendor-negotiation email draft.
4. **Widgets:** Use NitroStack's widget support to render the risk findings as an interactive table/dashboard directly inside the MCP client (NitroStudio or any MCP-compatible chat client), not just as plain text.

---

## Phase 4 — Market Benchmark Validation

**Goal:** Prove *why* a clause is non-standard using a local vector benchmark store.

1. **Local vector store:** Seed a local vector DB (Chroma, FAISS, or SQLite+`sqlite-vec`) with open-source baselines — standard YC SaaS terms, GDPR baselines, common enterprise liability norms.
2. **Similarity tool (`benchmark_clause`):** Given a flagged clause (e.g. "liability capped at 30 days"), runs a vector similarity search against the relevant category in the benchmark store.
3. **Comparative output:** Merge the risk finding with the benchmark match into a "Vendor Term vs. Industry Standard" side-by-side, rendered via a NitroStack widget in the dashboard.

---

## Phase 5 — Website (reusing the SprintFour UI)

**Goal:** A basic, working website that lets a user upload a contract, watch it move through the phases, and see the final risk dashboard — using SprintFour's existing UI as the visual and structural foundation, not a fresh design.

1. **Start from SprintFour's frontend, don't rebuild it:** Copy/fork SprintFour's existing upload screen, layout shell, nav, and theme (component library, spacing, colors, typography) into the Phalanx frontend. Only add new screens/sections where Phalanx genuinely needs something SprintFour doesn't have yet — everything else (upload dropzone, processing states, results list pattern) should look and behave the same way a user already knows from SprintFour.
2. **New screens needed on top of the reused shell:**
   - Upload screen (reuse SprintFour's as-is).
   - Processing/status view — extend SprintFour's existing status pattern to show the extra Phalanx phases (OCR → Redact → Graph → Risk Analysis → Benchmark) as steps, instead of SprintFour's single PII-scan step.
   - Risk dashboard — the new screen: clause list grouped by severity (Critical/High/Medium/Low), each with the plain-English explanation, the redline suggestion, and the "Vendor Term vs. Industry Standard" benchmark comparison from Phase 4.
   - De-redaction toggle — since PII/PCI tokens are reversible for the user only (Phase 1), add a "reveal original values" control on the results screen, following whatever confirmation/permission pattern SprintFour already uses for sensitive data.
3. **Frontend ↔ MCP server connection:** The website talks to the NitroStack MCP server over HTTP/SSE (same pattern NitroStack's own NitroChat reference client uses) — no separate REST backend to maintain in parallel.
4. **Keep it basic on purpose:** For the hackathon, this is a functional demo shell, not a polished product — prioritize the upload → phase-progress → risk dashboard flow working end-to-end over visual polish, since the visual polish is already inherited from SprintFour.

---

## End-to-end tool inventory (NitroStack `@Tool` surface)

| Tool | Phase | Input | Output |
|---|---|---|---|
| `ingest_document` | 0 | file (base64) | raw per-page text + OCR metadata |
| `classify_document` | 1 | fullText | doc type + policy schema ref |
| `redact_document` | 1 | fullText, policy | redacted text + token map (encrypted, local) |
| `build_graph` | 2 | redacted text | graph resource handle |
| `analyze_financial` / `analyze_liability` / `analyze_privacy` | 3 | graph handle | risk findings |
| `generate_redline` | 3 | risk findings, graph | counter-proposal + email draft |
| `benchmark_clause` | 4 | flagged clause | similarity score + standard-term comparison |

## Folder structure sketch
```
phalanx/
├── package.json                # "@nitrostack/core" dependency
├── src/
│   ├── index.ts                # NitroStack entry point / server bootstrap
│   ├── tools/
│   │   ├── ingest.tools.ts     # Phase 0 (OCR + native extraction)
│   │   ├── redaction.tools.ts  # Phase 1 (ported SprintFour PII service)
│   │   ├── graph.tools.ts      # Phase 2
│   │   ├── risk.tools.ts       # Phase 3 (financial/liability/privacy)
│   │   └── benchmark.tools.ts  # Phase 4
│   ├── services/
│   │   ├── ocr.service.ts
│   │   ├── redaction.service.ts   # adapted from SprintFour
│   │   ├── graph.service.ts
│   │   └── vector-store.service.ts
│   └── widgets/
│       └── risk-dashboard/     # rendered comparison + risk table
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── theme/              # forked/copied from SprintFour (tokens, components)
│   │   ├── screens/
│   │   │   ├── Upload.tsx          # reused from SprintFour
│   │   │   ├── ProcessingStatus.tsx # extended SprintFour pattern (5 phases)
│   │   │   ├── RiskDashboard.tsx    # new
│   │   │   └── DeRedactToggle.tsx   # new, follows SprintFour's sensitive-data pattern
│   │   └── mcp-client.ts       # HTTP/SSE connection to the NitroStack server
│   └── .env.example            # server URL, feature flags
├── deploy/
│   ├── server.Dockerfile       # or NitroCloud deploy config
│   └── frontend.Dockerfile     # static hosting build
└── .env.example                 # MCP_SERVER_PORT, WIDGET_PORT, storage paths, model paths
```

## Deployability checklist
- No hardcoded local file paths, ports, or machine-specific model paths — everything through `.env` / config.
- Server and frontend each build and run from a clean `git clone` with a documented `npm install && npm run build && npm start` (or equivalent) per package.
- Encrypted local token map (Phase 1) and vector store (Phase 4) use configurable storage paths so they work the same in a container as on a laptop.
- A single `docker-compose.yml` (or NitroCloud config) that brings up server + frontend together for the demo, mirroring NitroStack's own documented Docker setup for NitroStudio.

## Open items to confirm before building
- Which OCR engine to standardize on for the fully-local requirement — Tesseract.js is the safe default; confirm if SprintFour already bundles an OCR-capable model you'd rather reuse instead of adding a new dependency.
- Should Phase 3's redline/email drafting be allowed to call an external LLM (since by then the text is redacted/tokenized), or must the entire pipeline, including drafting, stay on local models to match SprintFour's all-local stance?
- Confirm the SprintFour PII module's current input format and its existing UI component library/framework (React? something else?) so the fork in Phase 5 step 1 can be scoped precisely.
- Confirm what "reveal original values" permission pattern SprintFour already uses (if any), so the de-redaction toggle in Phase 5 matches it rather than inventing a new one.

---

### How to use this
Paste this document into your coding agent (or NitroStack scaffold prompt) as the build spec. It's structured so each phase maps 1:1 to a NitroStack tool/service file, which keeps the "only NitroStack SDK" constraint enforceable and makes the hackathon demo narratable phase-by-phase (upload → OCR → redact → graph → multi-agent risk → benchmark).
