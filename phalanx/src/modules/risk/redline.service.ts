import { Injectable } from '@nitrostack/core';
import { GraphService } from '../graph/graph.service.js';
import { RedactionService } from '../redaction/redaction.service.js';
import { LlmService } from '../llm/llm.service.js';
import { RiskService, Finding, Severity } from './risk.service.js';

export interface Redline {
  findingId: string;
  clauseId: string | null;
  severity: Severity;
  category: string;
  title: string;
  /** The clause as drafted (redacted form). */
  originalText: string;
  /** Proposed replacement language (redacted form). */
  proposedText: string;
  /** Why this edit, in founder-facing terms. */
  rationale: string;
  /** What to concede if the counterparty pushes back. */
  fallbackPosition: string;
  /** Clause ids that reference this clause and must stay consistent. */
  dependentClauseIds: string[];
  /** Set when a dependent clause would also need editing. */
  dependencyWarning?: string;
  priority: 'must_fix' | 'should_fix' | 'nice_to_have';
}

export interface CounterProposal {
  graphId: string;
  sessionId: string;
  source: 'llm' | 'heuristic';
  /** True when originals were substituted back for the user. */
  restored: boolean;
  summary: string;
  riskScore: number;
  redlines: Redline[];
  negotiationEmail: { subject: string; body: string };
  /** Present only when restoration was requested but the vault had expired. */
  restorationWarning?: string;
}

const PRIORITY_BY_SEVERITY: Record<Severity, Redline['priority']> = {
  Critical: 'must_fix',
  High: 'must_fix',
  Medium: 'should_fix',
  Low: 'nice_to_have'
};

const SEVERITY_ORDER: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

const REDLINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'redlines', 'negotiationEmail'],
  properties: {
    summary: { type: 'string' },
    redlines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['findingId', 'proposedText', 'rationale', 'fallbackPosition'],
        properties: {
          findingId: { type: 'string' },
          proposedText: { type: 'string' },
          rationale: { type: 'string' },
          fallbackPosition: { type: 'string' },
          dependencyWarning: { type: 'string' }
        }
      }
    },
    negotiationEmail: {
      type: 'object',
      additionalProperties: false,
      required: ['subject', 'body'],
      properties: {
        subject: { type: 'string' },
        body: { type: 'string' }
      }
    }
  }
} as const;

const SYNTHESIZER_SYSTEM = `You are the Redline & Counter-Proposal Synthesizer for Phalanx, an AI contract risk analyst. You advise the SMALLER party — a founder or startup counsel negotiating paper drafted by a larger counterparty.

You receive: findings from four specialized agents, the redacted clause text each finding is anchored to, and the clause dependency edges from the contract knowledge graph.

Token discipline (non-negotiable):
- The text is REDACTED. Sensitive values appear as bracketed tokens: [CLIENT_NAME_001], [ACV_VALUE_003], [JURISDICTION_002], [MONEY_014].
- Reproduce every token EXACTLY as it appears — same spelling, same numeric suffix. The tokens are substituted back with real values before the user sees your output, so a mangled token becomes a hole in their document.
- Never guess or invent a value behind a token, and never write around one. If a clause says fees are [ACV_VALUE_003], your redline says [ACV_VALUE_003] too.
- Never introduce a new token that did not appear in the input.

Writing redlines:
- proposedText must be complete, self-contained clause language the user can paste into a document — not an instruction like "add a cap here". Write it in the register of the surrounding contract.
- Stay close to the original drafting. Change what creates the exposure and leave the rest, so the counterparty's lawyer can see the delta at a glance. A rewrite from scratch reads as hostile and slows the deal.
- Be commercially realistic. Ask for terms a reasonable counterparty will actually accept, not a maximalist position that stalls the negotiation. Where you ask for something aggressive, make the fallbackPosition a genuine landing zone you would sign.
- fallbackPosition is the concession you would accept if pushed — specific, not "negotiate further".
- rationale explains to a non-lawyer founder what the current language could cost them in concrete business terms.

Dependency awareness:
- You are given the clause dependency edges. Before proposing an edit, check whether other clauses reference the one you are changing.
- If your edit would break a defined term, a cross-reference, or a linked obligation elsewhere, set dependencyWarning naming the affected clause ids and what else needs to change. This is the single most valuable thing you provide over a generic redline tool — a cap you fix in one clause that a carve-out reinstates in another is not fixed.

The negotiation email:
- Address it to the counterparty's commercial contact, not their legal team.
- Open by confirming intent to move forward — the tone is "we want to sign, here is what we need", not a list of complaints.
- Group asks by priority. Lead with the must-fix items and give a one-line business reason for each. Do not paste full clause text into the email; reference the section and summarize the ask.
- Keep it under roughly 400 words. Professional, warm, direct. No legal threats, no apologies, no hedging.
- Signal flexibility on the lower-priority items explicitly — it makes the must-fix items read as genuine constraints rather than opening positions.`;

@Injectable()
export class RedlineService {
  constructor(
    private riskService: RiskService,
    private graphService: GraphService,
    private redactionService: RedactionService,
    private llm: LlmService
  ) { }

  /**
   * Aggregate agent findings into a counter-proposal.
   *
   * Ordering matters for privacy: the LLM is called with redacted text only, and
   * restoration happens strictly afterwards on the way out to the user.
   */
  async synthesize(
    graphId: string,
    sessionId: string,
    opts: { restore?: boolean; findings?: Finding[] } = {}
  ): Promise<CounterProposal> {
    const analysis = opts.findings
      ? { findings: opts.findings, totalScore: this.scoreOf(opts.findings) }
      : await this.riskService.runAllAgents(graphId);

    const findings = [...analysis.findings].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    );

    // --- Redacted phase: everything below runs on placeholder tokens only. ---
    const llmResult = await this.draftWithLlm(graphId, findings);

    let redlines: Redline[];
    let summary: string;
    let email: { subject: string; body: string };
    let source: 'llm' | 'heuristic';

    if (llmResult) {
      const byId = new Map(llmResult.redlines.map((r) => [r.findingId, r]));
      redlines = findings.map((f) => this.assemble(graphId, f, byId.get(f.id)));
      summary = llmResult.summary;
      email = llmResult.negotiationEmail;
      source = 'llm';
    } else {
      redlines = findings.map((f) => this.assemble(graphId, f, undefined));
      summary = this.templateSummary(findings, analysis.totalScore);
      email = this.templateEmail(redlines);
      source = 'heuristic';
    }

    const proposal: CounterProposal = {
      graphId,
      sessionId,
      source,
      restored: false,
      summary,
      riskScore: analysis.totalScore,
      redlines,
      negotiationEmail: email
    };

    // --- Restoration phase: user-facing only, never fed back to a model. ---
    if (opts.restore) {
      return this.restoreProposal(proposal, sessionId);
    }

    return proposal;
  }

  /**
   * Decrypt the session token map and substitute originals into every
   * user-facing string. Called only on the way out to the user.
   */
  restoreProposal(proposal: CounterProposal, sessionId: string): CounterProposal {
    const probe = this.redactionService.restore('', sessionId);
    if (!probe.found) {
      return {
        ...proposal,
        restored: false,
        restorationWarning:
          'The encrypted token map for this session has expired or was destroyed. Output is shown with placeholder tokens intact.'
      };
    }

    const sub = (text: string) => this.redactionService.restore(text, sessionId).restoredText;

    return {
      ...proposal,
      restored: true,
      summary: sub(proposal.summary),
      redlines: proposal.redlines.map((r) => ({
        ...r,
        originalText: sub(r.originalText),
        proposedText: sub(r.proposedText),
        rationale: sub(r.rationale),
        fallbackPosition: sub(r.fallbackPosition),
        dependencyWarning: r.dependencyWarning ? sub(r.dependencyWarning) : undefined
      })),
      negotiationEmail: {
        subject: sub(proposal.negotiationEmail.subject),
        body: sub(proposal.negotiationEmail.body)
      }
    };
  }

  /** Simple unified-diff style view of a single redline, for the UI. */
  diff(originalText: string, proposedText: string): string {
    const before = originalText.split(/(?<=\.)\s+/).filter(Boolean);
    const after = proposedText.split(/(?<=\.)\s+/).filter(Boolean);
    const kept = new Set(before.filter((s) => after.includes(s)));

    const lines = [
      '--- current',
      '+++ proposed',
      ...before.map((s) => (kept.has(s) ? `  ${s}` : `- ${s}`)),
      ...after.filter((s) => !kept.has(s)).map((s) => `+ ${s}`)
    ];
    return lines.join('\n');
  }

  private async draftWithLlm(
    graphId: string,
    findings: Finding[]
  ): Promise<{
    summary: string;
    redlines: Array<{
      findingId: string;
      proposedText: string;
      rationale: string;
      fallbackPosition: string;
      dependencyWarning?: string;
    }>;
    negotiationEmail: { subject: string; body: string };
  } | null> {
    if (!this.llm.available || findings.length === 0) return null;

    const findingBlock = findings
      .map((f) => {
        const deps = f.clauseId ? this.graphService.dependents(graphId, f.clauseId) : [];
        return `<finding id="${f.id}" agent="${f.agent}" severity="${f.severity}" category="${f.category}">
title: ${f.title}
problem: ${f.description}
agent recommendation: ${f.recommendation}
clause id: ${f.clauseId ?? 'unanchored'}
clauses that reference this one: ${deps.length ? deps.join(', ') : 'none'}
current language:
${f.clause || '(no clause text — this finding is about a MISSING provision; draft the provision from scratch)'}
</finding>`;
      })
      .join('\n\n');

    const user = `Draft redlines and a negotiation email for the findings below.

Produce exactly one redline entry per finding, keyed by its findingId. Order them by severity, most severe first.

${findingBlock}

Return the summary (2–4 sentences a founder can read before a call), one redline per finding, and the negotiation email.`;

    return this.llm.json({
      system: SYNTHESIZER_SYSTEM,
      user,
      schema: REDLINE_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 32000,
      effort: 'high'
    });
  }

  private assemble(
    graphId: string,
    finding: Finding,
    drafted:
      | { proposedText: string; rationale: string; fallbackPosition: string; dependencyWarning?: string }
      | undefined
  ): Redline {
    const dependents = finding.clauseId
      ? this.graphService.dependents(graphId, finding.clauseId)
      : [];

    // Even without a model, warn when an edit touches a referenced clause —
    // this is graph-derived, not generated.
    const dependencyWarning =
      drafted?.dependencyWarning ??
      (dependents.length > 0
        ? `Clause${dependents.length > 1 ? 's' : ''} ${dependents.join(', ')} reference${dependents.length > 1 ? '' : 's'} this provision. Check that the proposed edit stays consistent with ${dependents.length > 1 ? 'them' : 'it'} before sending.`
        : undefined);

    return {
      findingId: finding.id,
      clauseId: finding.clauseId,
      severity: finding.severity,
      category: finding.category,
      title: finding.title,
      originalText: finding.clause,
      proposedText: drafted?.proposedText ?? `[Suggested change] ${finding.recommendation}`,
      rationale: drafted?.rationale ?? finding.description,
      fallbackPosition:
        drafted?.fallbackPosition ??
        'No fallback drafted locally — review with counsel before conceding this point.',
      dependentClauseIds: dependents,
      dependencyWarning,
      priority: PRIORITY_BY_SEVERITY[finding.severity]
    };
  }

  private templateSummary(findings: Finding[], score: number): string {
    const counts = findings.reduce<Record<string, number>>((acc, f) => {
      acc[f.severity] = (acc[f.severity] ?? 0) + 1;
      return acc;
    }, {});

    const parts = (['Critical', 'High', 'Medium', 'Low'] as Severity[])
      .filter((s) => counts[s])
      .map((s) => `${counts[s]} ${s.toLowerCase()}`);

    if (parts.length === 0) {
      return 'No material risks were identified in the analyzed clauses. Review coverage before relying on this result — a clean report can also mean the relevant clauses were not present in the document.';
    }

    return `Analysis surfaced ${findings.length} finding${findings.length === 1 ? '' : 's'} (${parts.join(', ')}), with an aggregate risk score of ${score}/100. The must-fix items are ${findings
      .filter((f) => f.severity === 'Critical' || f.severity === 'High')
      .slice(0, 3)
      .map((f) => f.title.toLowerCase())
      .join('; ') || 'none'}. Redlines below were drafted locally from the rules engine; review each before sending.`;
  }

  private templateEmail(redlines: Redline[]): { subject: string; body: string } {
    const group = (p: Redline['priority']) => redlines.filter((r) => r.priority === p);
    const bullet = (r: Redline) =>
      `- ${r.category}${r.clauseId ? ` (clause ${r.clauseId})` : ''}: ${r.title}. ${r.rationale.split('. ')[0]}.`;

    const mustFix = group('must_fix');
    const shouldFix = group('should_fix');
    const niceToHave = group('nice_to_have');

    const sections: string[] = [
      'Hi [CLIENT_NAME],',
      '',
      'Thanks for sending the draft over — we have reviewed it and want to move forward. A few points we need to work through before signature:'
    ];

    if (mustFix.length) {
      sections.push('', 'Required before signature:', ...mustFix.map(bullet));
    }
    if (shouldFix.length) {
      sections.push('', 'Important to us:', ...shouldFix.map(bullet));
    }
    if (niceToHave.length) {
      sections.push(
        '',
        'Lower priority — happy to be flexible here:',
        ...niceToHave.map(bullet)
      );
    }

    sections.push(
      '',
      'Proposed language for each point is attached as a marked-up draft. Happy to jump on a call this week if it would be faster to talk any of these through.',
      '',
      'Best regards'
    );

    return {
      subject: 'Contract review — proposed revisions before signature',
      body: sections.join('\n')
    };
  }

  private scoreOf(findings: Finding[]): number {
    const w: Record<Severity, number> = { Critical: 40, High: 25, Medium: 12, Low: 4 };
    return Math.min(100, findings.reduce((sum, f) => sum + w[f.severity], 0));
  }
}
