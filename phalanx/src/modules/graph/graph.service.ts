import { Injectable } from '@nitrostack/core';
import Graph from 'graphology';
import crypto from 'crypto';
import { LlmService } from '../llm/llm.service.js';

export type ClauseCategory =
  | 'parties'
  | 'term_and_termination'
  | 'payment'
  | 'renewal'
  | 'liability'
  | 'indemnity'
  | 'data_protection'
  | 'confidentiality'
  | 'ip_ownership'
  | 'governing_law'
  | 'jurisdiction'
  | 'sla'
  | 'audit'
  | 'publicity'
  | 'assignment'
  | 'force_majeure'
  | 'other';

export interface ExtractedClause {
  id: string;
  title: string;
  page: number;
  sectionNumber: string;
  /** Redacted clause text, verbatim. */
  text: string;
  category: ClauseCategory;
  /** Party bearing the obligation, as a token or role label. */
  obligor?: string;
  /** Party benefiting, as a token or role label. */
  obligee?: string;
  /** Placeholder tokens appearing in this clause. */
  tokens: string[];
  /** Ids of clauses this one depends on or references. */
  dependsOn: string[];
}

export interface ExtractedEntity {
  id: string;
  /** Placeholder token or role label — never a real name. */
  label: string;
  type: 'party' | 'jurisdiction' | 'date' | 'amount' | 'subprocessor' | 'other';
}

export interface ExtractedEdge {
  from: string;
  to: string;
  relation: 'references' | 'triggers' | 'limits' | 'governs' | 'obligates' | 'benefits' | 'defines';
  note?: string;
}

export interface ContractGraph {
  graphId: string;
  sessionId: string;
  doctype: string;
  source: 'llm' | 'heuristic';
  nodeCount: number;
  edgeCount: number;
  categories: Record<string, number>;
  export: ReturnType<Graph['export']>;
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['clauses', 'entities', 'edges'],
  properties: {
    clauses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'page', 'sectionNumber', 'text', 'category', 'tokens', 'dependsOn'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          page: { type: 'number' },
          sectionNumber: { type: 'string' },
          text: { type: 'string' },
          category: {
            type: 'string',
            enum: [
              'parties', 'term_and_termination', 'payment', 'renewal', 'liability',
              'indemnity', 'data_protection', 'confidentiality', 'ip_ownership',
              'governing_law', 'jurisdiction', 'sla', 'audit', 'publicity',
              'assignment', 'force_majeure', 'other'
            ]
          },
          obligor: { type: 'string' },
          obligee: { type: 'string' },
          tokens: { type: 'array', items: { type: 'string' } },
          dependsOn: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'type'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          type: {
            type: 'string',
            enum: ['party', 'jurisdiction', 'date', 'amount', 'subprocessor', 'other']
          }
        }
      }
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'relation'],
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          relation: {
            type: 'string',
            enum: ['references', 'triggers', 'limits', 'governs', 'obligates', 'benefits', 'defines']
          },
          note: { type: 'string' }
        }
      }
    }
  }
} as const;

const GRAPH_BUILDER_SYSTEM = `You are a contract structuring engine. You convert a commercial contract into a clause-level knowledge graph that downstream risk agents will query.

The text you receive has ALREADY been redacted. Sensitive values appear as bracketed placeholder tokens such as [CLIENT_NAME_001], [ACV_VALUE_004], [JURISDICTION_002], [MONEY_011]. These tokens are first-class entities:
- Treat each distinct token as a stable identifier for one real-world value.
- Reproduce tokens exactly, character for character, wherever they appear.
- Never guess, infer, invent, or paraphrase what a token might stand for. Do not write "likely the customer" or "probably a US state".
- If a clause's meaning genuinely depends on a redacted value you cannot see, extract the clause anyway and describe the dependency structurally.

Rules for extraction:
1. One clause node per operative provision. Split a numbered section into multiple clauses when it contains genuinely separate obligations; do not split a single obligation across nodes.
2. For each clause, provide its exact 'title' (e.g. "Limitation of Liability"), the 'page' number it begins on (using the ---PAGE_X--- markers provided in the text), and its 'sectionNumber' (e.g. "16.1", "IV(a)"). If a section number is not present, use an empty string.
3. Copy clause 'text' verbatim from the input. Do not summarize, reword, or clean it up. Truncate only if a clause exceeds roughly 1200 characters, and mark the truncation with a trailing ellipsis.
4. Assign exactly one category per clause, from the allowed enum. Use 'other' only when no category fits.
4. Set 'obligor' and 'obligee' to the placeholder token or the contract's own role label ("Provider", "Customer"). Omit them for clauses that impose no obligation on a specific party.
5. 'tokens' lists every placeholder token appearing in that clause's text.
6. 'dependsOn' captures real structural dependency, not topical similarity. A termination clause that forces data deletion depends on the data-deletion clause. Two unrelated clauses that both mention fees do not depend on each other.
7. 'edges' carries relationships beyond plain dependency:
   - triggers: one clause's event causes another's obligation to activate
   - limits: a cap, exclusion, or carve-out constraining another clause
   - governs: a governing-law or jurisdiction clause controlling another
   - obligates / benefits: link a clause node to a party entity node
   - defines: a definitions clause supplying a term another clause uses
   - references: an explicit cross-reference with no stronger semantics
8. Use clause ids of the form c1, c2, c3 and entity ids of the form e1, e2, e3. Every 'from' and 'to' in edges must match an id you emitted.

Be exhaustive on liability, indemnity, payment, renewal, termination, data protection, and confidentiality — those subgraphs drive the risk analysis. Missing a liability cap or an auto-renewal window is a serious failure.`;

@Injectable({ deps: [LlmService] })
export class GraphService {
  /** In-memory graph store, keyed by graphId. NetworkX-equivalent, process-local. */
  private graphs = new Map<string, { graph: Graph; meta: Omit<ContractGraph, 'export'> }>();

  constructor(private llm: LlmService) { }

  /**
   * Build a clause graph from REDACTED text. Uses the LLM extractor when a model
   * is configured, otherwise falls back to a local structural parser so the
   * pipeline still completes offline.
   */
  async buildFromText(
    redactedText: string,
    doctype: string,
    sessionId: string
  ): Promise<ContractGraph> {
    let extraction = await this.extractWithLlm(redactedText, doctype);
    let source: 'llm' | 'heuristic' = 'llm';

    if (!extraction || extraction.clauses.length === 0) {
      extraction = this.extractHeuristically(redactedText);
      source = 'heuristic';
    }

    return this.assemble(extraction, doctype, sessionId, source);
  }

  /** Build using ONLY the local heuristic — no LLM, no network, ~instant. */
  buildHeuristicFromText(
    redactedText: string,
    doctype: string,
    sessionId: string
  ): ContractGraph {
    const extraction = this.extractHeuristically(redactedText);
    return this.assemble(extraction, doctype, sessionId, 'heuristic');
  }

  private async extractWithLlm(
    redactedText: string,
    doctype: string
  ): Promise<{ clauses: ExtractedClause[]; entities: ExtractedEntity[]; edges: ExtractedEdge[] } | null> {
    if (!this.llm.available) return null;

    const user = `Contract type selected by the user: ${doctype}

Extract the clause graph from the redacted contract text below.

<redacted_contract>
${redactedText}
</redacted_contract>`;

    return this.llm.json({
      system: GRAPH_BUILDER_SYSTEM,
      user,
      schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 32000,
      effort: 'high'
    });
  }

  /**
   * Local fallback: split on numbered/underlined headings and categorize by
   * keyword. Deliberately simple — it exists so the demo never dead-ends, not to
   * match the LLM extractor's quality.
   */
  private extractHeuristically(redactedText: string): {
    clauses: ExtractedClause[];
    entities: ExtractedEntity[];
    edges: ExtractedEdge[];
  } {
    const CATEGORY_KEYWORDS: Array<[ClauseCategory, RegExp]> = [
      ['liability', /\b(limitation of liability|liability cap|aggregate liability|consequential damages)\b/i],
      ['indemnity', /\b(indemnif|hold harmless|defend)\b/i],
      ['payment', /\b(payment terms|invoice|net \d+|fees|late payment)\b/i],
      ['renewal', /\b(auto-?renew|renewal term|evergreen|non-?renewal notice)\b/i],
      ['term_and_termination', /\b(term and termination|terminate|termination for)\b/i],
      ['data_protection', /\b(data protection|personal data|GDPR|CCPA|sub-?processor|breach notification)\b/i],
      ['confidentiality', /\b(confidential|non-?disclosure|trade secret)\b/i],
      ['ip_ownership', /\b(intellectual property|ownership|license grant|work product)\b/i],
      ['governing_law', /\b(governing law|construed in accordance)\b/i],
      ['jurisdiction', /\b(jurisdiction|venue|arbitration|dispute resolution)\b/i],
      ['sla', /\b(service level|uptime|availability|SLA|service credit)\b/i],
      ['audit', /\b(audit|inspection rights|records)\b/i],
      ['publicity', /\b(publicity|logo|trademark use|press release|marketing materials)\b/i],
      ['assignment', /\b(assignment|assign this agreement|change of control)\b/i],
      ['force_majeure', /\b(force majeure|acts of god)\b/i],
      ['parties', /\b(this agreement is (?:made|entered)|between .* and )\b/i]
    ];

    // We now have page markers in the text (e.g., \n---PAGE_1---\n)
    let currentPage = 1;

    // Split on things that look like clause headings: "5.", "5.2", "ARTICLE 5", "Section 5", or page markers.
    // Wait, splitting by just that might split pages awkwardly, let's keep the split and just extract page markers.
    const blocks = redactedText
      .split(/\n(?=\s*(?:(?:ARTICLE|Article|SECTION|Section)\s+\d+|\d+(?:\.\d+)*\.?\s+[A-Z]|---PAGE_\d+---))/)
      .map((b) => b.trim())
      .filter((b) => b.length > 20);

    const clauses: ExtractedClause[] = [];
    let clauseIdCounter = 1;

    for (let block of blocks) {
      const pageMatch = block.match(/^---PAGE_(\d+)---/);
      if (pageMatch) {
        currentPage = parseInt(pageMatch[1], 10);
        block = block.replace(/^---PAGE_\d+---\s*/, '');
      }
      if (block.length < 40) continue;

      const firstLine = block.split('\n')[0].slice(0, 120).trim();
      
      const secMatch = firstLine.match(/^(?:ARTICLE|Article|SECTION|Section\s+)?(\d+(?:\.\d+)*)/);
      const sectionNumber = secMatch ? secMatch[1] : '';
      const title = firstLine.replace(/^(?:ARTICLE|Article|SECTION|Section\s+)?\d+(?:\.\d+)*\.?\s*/, '') || `Clause ${clauseIdCounter}`;

      const category = CATEGORY_KEYWORDS.find(([, re]) => re.test(block))?.[0] ?? ('other' as ClauseCategory);

      clauses.push({
        id: `c${clauseIdCounter++}`,
        title,
        page: currentPage,
        sectionNumber,
        text: block.slice(0, 1200),
        category,
        tokens: [...new Set(block.match(/\[[A-Z_]+_\d+\]/g) ?? [])],
        dependsOn: []
      });
    }

    // Entities: one node per distinct token in the whole document.
    const tokenTypes: Record<string, ExtractedEntity['type']> = {
      CLIENT_NAME: 'party',
      VENDOR_NAME: 'party',
      AFFILIATE_NAME: 'party',
      SIGNATORY_NAME: 'party',
      SUBPROCESSOR_NAME: 'subprocessor',
      JURISDICTION: 'jurisdiction',
      DATA_CENTER_LOCATION: 'jurisdiction',
      ACV_VALUE: 'amount',
      MONEY: 'amount',
      PERCENTAGE: 'amount',
      DATE: 'date'
    };

    const allTokens = [...new Set(redactedText.match(/\[[A-Z_]+_\d+\]/g) ?? [])];
    const entities: ExtractedEntity[] = allTokens.map((token, i) => {
      const entityName = token.replace(/^\[|_\d+\]$/g, '');
      return { id: `e${i + 1}`, label: token, type: tokenTypes[entityName] ?? 'other' };
    });

    // Edges: link each clause to the entities it mentions, plus the well-known
    // termination -> data deletion dependency the spec calls out.
    const edges: ExtractedEdge[] = [];
    const entityByLabel = new Map(entities.map((e) => [e.label, e.id]));

    for (const clause of clauses) {
      for (const token of clause.tokens) {
        const entityId = entityByLabel.get(token);
        if (entityId) edges.push({ from: clause.id, to: entityId, relation: 'references' });
      }
    }

    const termination = clauses.find((c) => c.category === 'term_and_termination');
    const dataClause = clauses.find((c) => c.category === 'data_protection');
    if (termination && dataClause) {
      edges.push({
        from: termination.id,
        to: dataClause.id,
        relation: 'triggers',
        note: 'Termination triggers data return/deletion obligations'
      });
      termination.dependsOn.push(dataClause.id);
    }

    const governing = clauses.find((c) => c.category === 'governing_law');
    if (governing) {
      for (const clause of clauses) {
        if (clause.id !== governing.id) {
          edges.push({ from: governing.id, to: clause.id, relation: 'governs' });
        }
      }
    }

    return { clauses, entities, edges };
  }

  /** Materialize the extraction into a graphology graph and cache it. */
  private assemble(
    extraction: { clauses: ExtractedClause[]; entities: ExtractedEntity[]; edges: ExtractedEdge[] },
    doctype: string,
    sessionId: string,
    source: 'llm' | 'heuristic'
  ): ContractGraph {
    const graph = new Graph({ multi: true, type: 'directed' });
    const categories: Record<string, number> = {};

    for (const c of extraction.clauses) {
      graph.addNode(c.id, {
        kind: 'clause',
        type: 'clause',
        title: c.title,
        page: c.page,
        sectionNumber: c.sectionNumber,
        text: c.text,
        category: c.category,
        obligor: c.obligor ?? null,
        obligee: c.obligee ?? null,
        tokens: c.tokens ?? []
      });
      categories[c.category] = (categories[c.category] || 0) + 1;
    }

    for (const entity of extraction.entities ?? []) {
      if (graph.hasNode(entity.id)) continue;
      graph.addNode(entity.id, { kind: 'entity', label: entity.label, entityType: entity.type });
    }

    const addEdge = (from: string, to: string, attrs: Record<string, unknown>) => {
      if (!graph.hasNode(from) || !graph.hasNode(to) || from === to) return;
      graph.addDirectedEdge(from, to, attrs);
    };

    for (const clause of extraction.clauses) {
      for (const target of clause.dependsOn ?? []) {
        addEdge(clause.id, target, { relation: 'depends_on' });
      }
    }

    for (const edge of extraction.edges ?? []) {
      addEdge(edge.from, edge.to, { relation: edge.relation, note: edge.note ?? null });
    }

    const graphId = `graph_${crypto.randomBytes(6).toString('hex')}`;
    const meta = {
      graphId,
      sessionId,
      doctype,
      source,
      nodeCount: graph.order,
      edgeCount: graph.size,
      categories
    };

    this.graphs.set(graphId, { graph, meta });
    return { ...meta, export: graph.export() };
  }

  /** Legacy entry point: build a graph from a pre-extracted clause list. */
  async buildGraph(
    clauses: Array<{ id: string; text: string; type: string; relatedTo: string[] }>
  ): Promise<ContractGraph> {
    const normalized: ExtractedClause[] = clauses.map((c) => ({
      id: c.id,
      title: c.text.slice(0, 80),
      page: 1,
      sectionNumber: c.id,
      text: c.text,
      category: (c.type as ClauseCategory) ?? 'other',
      tokens: [...new Set(c.text.match(/\[[A-Z_]+_\d+\]/g) ?? [])],
      dependsOn: c.relatedTo ?? []
    }));

    return this.assemble({ clauses: normalized, entities: [], edges: [] }, 'general_contract', 'n/a', 'heuristic');
  }

  has(graphId: string): boolean {
    return this.graphs.has(graphId);
  }

  getGraph(graphId: string): Graph | null {
    return this.graphs.get(graphId)?.graph ?? null;
  }

  getMeta(graphId: string): Omit<ContractGraph, 'export'> | null {
    return this.graphs.get(graphId)?.meta ?? null;
  }

  getExport(graphId: string): ContractGraph | null {
    const entry = this.graphs.get(graphId);
    if (!entry) return null;
    return { ...entry.meta, export: entry.graph.export() };
  }

  /**
   * Return the sub-graph relevant to a set of clause categories: matching clause
   * nodes, their attached entities, and their 1-hop neighbours. This is what the
   * specialized agents query instead of re-reading raw text.
   */
  query(
    graphId: string,
    categories: ClauseCategory[]
  ): {
    clauses: Array<{ id: string; title: string; page: number; sectionNumber: string; text: string; category: string; obligor: string | null; obligee: string | null; tokens: string[] }>;
    entities: Array<{ id: string; label: string; entityType: string }>;
    relations: Array<{ from: string; to: string; relation: string; note: string | null }>;
  } {
    const graph = this.getGraph(graphId);
    if (!graph) return { clauses: [], entities: [], relations: [] };

    const wanted = new Set<string>(categories);
    const seed = graph.filterNodes(
      (_id, attrs) => attrs.kind === 'clause' && wanted.has(attrs.category)
    );

    // 1-hop closure so a liability clause pulls in the cap that limits it.
    const included = new Set(seed);
    for (const id of seed) {
      graph.forEachNeighbor(id, (neighbor) => included.add(neighbor));
    }

    const clauses: any[] = [];
    const entities: any[] = [];

    for (const id of included) {
      const attrs = graph.getNodeAttributes(id);
      if (attrs.kind === 'clause') {
        clauses.push({
          id,
          title: attrs.title ?? '',
          page: attrs.page ?? 1,
          sectionNumber: attrs.sectionNumber ?? '',
          text: attrs.text,
          category: attrs.category,
          obligor: attrs.obligor ?? null,
          obligee: attrs.obligee ?? null,
          tokens: attrs.tokens ?? []
        });
      } else {
        entities.push({ id, label: attrs.label, entityType: attrs.entityType });
      }
    }

    const relations: any[] = [];
    graph.forEachDirectedEdge((_edge, attrs, source, target) => {
      if (included.has(source) && included.has(target)) {
        relations.push({ from: source, to: target, relation: attrs.relation, note: attrs.note ?? null });
      }
    });

    return { clauses, entities, relations };
  }

  /** Clauses that would be affected by editing `clauseId` — used to vet redlines. */
  dependents(graphId: string, clauseId: string): string[] {
    const graph = this.getGraph(graphId);
    if (!graph || !graph.hasNode(clauseId)) return [];

    const out = new Set<string>();
    graph.forEachInNeighbor(clauseId, (n) => out.add(n));
    graph.forEachOutNeighbor(clauseId, (n) => out.add(n));
    return [...out].filter((id) => graph.getNodeAttribute(id, 'kind') === 'clause');
  }

  drop(graphId: string): void {
    this.graphs.delete(graphId);
  }
}
