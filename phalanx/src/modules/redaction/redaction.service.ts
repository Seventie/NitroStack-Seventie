import { Injectable } from '@nitrostack/core';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { SessionVaultService } from './session-vault.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RedactionPolicy {
  label: string;
  description: string;
  /** Structural entities matched by regex. */
  regexEntities: string[];
  /** Context-dependent entities extracted by the local rule pass. */
  contextEntities: string[];
  /** Things the policy explicitly wants left readable so agents can reason. */
  preserve: string[];
}

export interface RedactionResult {
  sessionId: string;
  doctype: string;
  policy: { label: string; regexEntities: string[]; contextEntities: string[]; preserve: string[] };
  redactedText: string;
  /** Token -> entity type only. The original values stay in the encrypted vault. */
  tokenIndex: Record<string, string>;
  stats: { totalTokens: number; byEntity: Record<string, number> };
}

interface Pattern {
  name: string;
  regex: RegExp;
  confidence: number;
}

/**
 * Structural PII/PCI patterns. Ordering matters: longer, more specific patterns
 * run first so a credit card is not partially consumed by the phone matcher.
 */
const PATTERNS: Pattern[] = [
  { name: 'EMAIL_ADDRESS', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, confidence: 0.97 },
  { name: 'URL', regex: /\bhttps?:\/\/[^\s<>"')\]]+/gi, confidence: 0.95 },
  { name: 'IBAN', regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, confidence: 0.9 },
  { name: 'CREDIT_CARD', regex: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g, confidence: 0.96 },
  { name: 'AADHAAR', regex: /\b\d{4}\s\d{4}\s\d{4}\b/g, confidence: 0.98 },
  { name: 'US_SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g, confidence: 0.98 },
  { name: 'PAN', regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g, confidence: 0.99 },
  { name: 'BANK_ACCOUNT', regex: /\b(?:account|a\/c|acct)[\s.:#]*(?:no\.?|number)?[\s.:#]*\d{8,18}\b/gi, confidence: 0.88 },
  { name: 'PO_NUMBER', regex: /\b(?:P\.?O\.?|purchase order)[\s.:#-]*[A-Z0-9-]{4,20}\b/gi, confidence: 0.85 },
  { name: 'IP_ADDRESS', regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g, confidence: 0.95 },
  { name: 'PHONE_NUMBER', regex: /(?:\+\d{1,3}[\s-]?)?(?<!\d)(?:\(\d{3}\)[\s-]?|\d{3}[\s-])\d{3}[\s-]?\d{4}(?!\d)|(?:\+91[\s-]?)?(?<!\d)[6-9]\d{9}(?!\d)/g, confidence: 0.85 },
  // Currency amounts: $1,200,000 / USD 1.2M / 250,000 EUR / ₹45,00,000
  { name: 'MONEY', regex: /(?:(?:US\$|\$|₹|€|£)\s?\d[\d,.]*(?:\s?(?:million|billion|mn|bn|k|M|B))?)|(?:\b(?:USD|EUR|GBP|INR|AUD|CAD)\s?\d[\d,.]*(?:\s?(?:million|billion|mn|bn|k|M|B))?)|(?:\b\d[\d,.]*\s?(?:USD|EUR|GBP|INR|AUD|CAD)\b)/g, confidence: 0.9 },
  { name: 'PERCENTAGE', regex: /\b\d{1,3}(?:\.\d+)?\s?(?:%|percent)\b/gi, confidence: 0.75 }
];

/**
 * Local, no-network heuristics for the context-dependent entities each policy
 * asks for. These run BEFORE anything reaches an external model — that ordering
 * is the whole point of the architecture, so this pass must stay purely local.
 */
const CONTEXT_RULES: Array<{ name: string; regex: RegExp; group: number }> = [
  // Corporate suffix form: "Acme Systems Pvt. Ltd."
  { name: 'CLIENT_NAME', regex: /\b([A-Z][A-Za-z0-9&.,'-]*(?:\s+[A-Z][A-Za-z0-9&.,'-]*){0,5}\s+(?:Inc\.?|LLC|L\.L\.C\.|Ltd\.?|Limited|GmbH|Pvt\.?\s?Ltd\.?|Corp\.?|Corporation|Company|Co\.|PLC|LLP|S\.A\.|B\.V\.))/g, group: 1 },
  // Defined-term form: 'Acme Corp ("Customer")'
  { name: 'CLIENT_NAME', regex: /\b([A-Z][A-Za-z0-9&.,'-]*(?:\s+[A-Z][A-Za-z0-9&.,'-]*){0,4})\s*\(\s*(?:the\s+)?["“']?(?:Customer|Client|Purchaser|Buyer)["”']?\s*\)/g, group: 1 },
  { name: 'VENDOR_NAME', regex: /\b([A-Z][A-Za-z0-9&.,'-]*(?:\s+[A-Z][A-Za-z0-9&.,'-]*){0,4})\s*\(\s*(?:the\s+)?["“']?(?:Provider|Vendor|Supplier|Contractor|Licensor|Processor)["”']?\s*\)/g, group: 1 },
  { name: 'AFFILIATE_NAME', regex: /\baffiliates?\s+(?:including|namely|such as)\s+([A-Z][A-Za-z0-9&.,'\s-]{2,60}?)(?=[,.;)])/g, group: 1 },
  { name: 'SUBPROCESSOR_NAME', regex: /\bsub-?processors?\s+(?:including|namely|such as|:)\s*([A-Z][A-Za-z0-9&.,'\s-]{2,80}?)(?=[,.;)])/gi, group: 1 },
  { name: 'DPO_NAME', regex: /\b(?:Data Protection Officer|DPO)\s*(?:is|:|shall be)\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})/g, group: 1 },
  { name: 'DATA_CENTER_LOCATION', regex: /\b(?:data\s+(?:centre|center)s?|hosted|stored|processed)\s+(?:is\s+|are\s+|located\s+)?in\s+([A-Z][A-Za-z-]+(?:,\s?[A-Z][A-Za-z-]+){0,2})/g, group: 1 },
  { name: 'JURISDICTION', regex: /\b(?:governed by|construed in accordance with|laws of|courts of|exclusive jurisdiction of)\s+(?:the\s+)?(?:State of\s+|Commonwealth of\s+)?([A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){0,3})/g, group: 1 },
  { name: 'SIGNATORY_NAME', regex: /\b(?:Name|Signed by|Authori[sz]ed Signatory|By)\s*:\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3})/g, group: 1 },
  { name: 'PROJECT_CODENAME', regex: /\b(?:Project|Codename|Code Name)\s+["“']?([A-Z][A-Za-z0-9-]{2,24})["”']?/g, group: 1 },
  { name: 'TRADE_SECRET', regex: /\b(?:proprietary|trade secret)\s+(?:algorithm|process|formula|method|technology)\s+(?:known as|called|designated)\s+["“']?([A-Za-z0-9 -]{3,40})["”']?/gi, group: 1 },
  { name: 'SECURITY_CONTACT', regex: /\b(?:security contact|incident contact)\s*(?:is|:)\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})/gi, group: 1 },
  // Captured as its own entity so the financial agent can see that a commercial
  // figure existed at all, without ever seeing the number.
  { name: 'ACV_VALUE', regex: /\b(?:Annual Contract Value|ACV|Total Contract Value|TCV|Annual Recurring Revenue|ARR)\s*(?:of|:|=|shall be)?\s*((?:US\$|\$|₹|€|£)?\s?\d[\d,.]*(?:\s?(?:million|billion|mn|bn|k|M|B))?)/gi, group: 1 }
];

/** Names too generic to be a real party — matching these produces noise. */
const ENTITY_STOPWORDS = new Set([
  'The Agreement', 'This Agreement', 'The Parties', 'The Party', 'Effective Date',
  'Exhibit A', 'Exhibit B', 'Schedule A', 'Schedule B', 'Section', 'Article',
  'Confidential Information', 'Intellectual Property', 'Force Majeure',
  'Customer', 'Provider', 'Vendor', 'Supplier', 'Company', 'Corporation'
]);

@Injectable()
export class RedactionService {
  private policies: Record<string, RedactionPolicy> = {};

  constructor(private vault: SessionVaultService) {
    this.loadPolicies();
  }

  private loadPolicies() {
    // dist/modules/redaction/ and src/modules/redaction/ are both 3 levels deep.
    const candidates = [
      path.resolve(__dirname, '../../../data/redaction-policies.json'),
      path.resolve(process.cwd(), 'data/redaction-policies.json')
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        this.policies = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        return;
      }
    }
    console.warn('[redaction] policy file not found; falling back to permissive defaults');
  }

  listPolicies(): Array<{ doctype: string; label: string; description: string }> {
    return Object.entries(this.policies).map(([doctype, p]) => ({
      doctype,
      label: p.label,
      description: p.description
    }));
  }

  /** Resolve a user-selected contract type to a policy, defaulting conservatively. */
  resolvePolicy(doctype: string): { key: string; policy: RedactionPolicy } {
    const requested = (doctype || '').toLowerCase().trim().replace(/[\s-]+/g, '_');

    if (this.policies[requested]) return { key: requested, policy: this.policies[requested] };
    if (this.policies['general_contract']) {
      return { key: 'general_contract', policy: this.policies['general_contract'] };
    }

    // No policy file at all — redact everything we can detect.
    return {
      key: 'general_contract',
      policy: {
        label: 'General Contract (built-in default)',
        description: 'Policy file unavailable; redacting all detectable entities.',
        regexEntities: PATTERNS.map((p) => p.name),
        contextEntities: CONTEXT_RULES.map((r) => r.name),
        preserve: []
      }
    };
  }

  /**
   * Redact `text` under the policy for `doctype`, store the reverse map in the
   * encrypted vault, and return only the redacted text plus a type-only index.
   */
  async redact(text: string, doctype: string, sessionId?: string): Promise<RedactionResult> {
    const { key, policy } = this.resolvePolicy(doctype);
    const session = sessionId || `sess_${crypto.randomBytes(8).toString('hex')}`;

    const tokenMap: Record<string, string> = {};
    const tokenIndex: Record<string, string> = {};
    const byEntity: Record<string, number> = {};
    // One token per distinct original value, so the graph can tell that two
    // mentions of the same party are the same node.
    const valueToToken = new Map<string, string>();
    let counter = 0;

    const mint = (entity: string, original: string): string => {
      const cacheKey = `${entity}::${original}`;
      const cached = valueToToken.get(cacheKey);
      if (cached) return cached;

      counter += 1;
      const token = `[${entity}_${String(counter).padStart(3, '0')}]`;
      valueToToken.set(cacheKey, token);
      tokenMap[token] = original;
      tokenIndex[token] = entity;
      byEntity[entity] = (byEntity[entity] || 0) + 1;
      return token;
    };

    let redactedText = text;

    // Pass 1 — context-dependent entities. Runs first so a party name containing
    // digits is not partly eaten by a structural pattern.
    for (const rule of CONTEXT_RULES) {
      if (!policy.contextEntities.includes(rule.name)) continue;

      const captured = new Set<string>();
      for (const match of redactedText.matchAll(new RegExp(rule.regex.source, rule.regex.flags))) {
        const value = (match[rule.group] || '').trim().replace(/[.,;:]+$/, '');
        if (value.length < 2 || ENTITY_STOPWORDS.has(value)) continue;
        if (value.includes('[') || value.includes(']')) continue; // already tokenized
        captured.add(value);
      }

      // Longest first, so "Acme Corp International" is not clipped by "Acme Corp".
      for (const value of [...captured].sort((a, b) => b.length - a.length)) {
        const token = mint(rule.name, value);
        redactedText = redactedText.split(value).join(token);
      }
    }

    // Pass 2 — structural patterns.
    for (const pattern of PATTERNS) {
      if (!policy.regexEntities.includes(pattern.name)) continue;

      redactedText = redactedText.replace(
        new RegExp(pattern.regex.source, pattern.regex.flags),
        (match) => mint(pattern.name, match)
      );
    }

    this.vault.put(session, tokenMap);

    return {
      sessionId: session,
      doctype: key,
      policy: {
        label: policy.label,
        regexEntities: policy.regexEntities,
        contextEntities: policy.contextEntities,
        preserve: policy.preserve
      },
      redactedText,
      tokenIndex,
      stats: { totalTokens: Object.keys(tokenMap).length, byEntity }
    };
  }

  /**
   * Reverse the redaction for user-facing output. Decrypts the session vault,
   * substitutes originals, and never returns the map itself.
   */
  restore(text: string, sessionId: string): { restoredText: string; substitutions: number; found: boolean } {
    const tokenMap = this.vault.get(sessionId);
    if (!tokenMap) return { restoredText: text, substitutions: 0, found: false };

    let restoredText = text;
    let substitutions = 0;

    // Longest token first — `[CLIENT_NAME_010]` must not be mangled by a prefix match.
    for (const token of Object.keys(tokenMap).sort((a, b) => b.length - a.length)) {
      const parts = restoredText.split(token);
      if (parts.length > 1) {
        substitutions += parts.length - 1;
        restoredText = parts.join(tokenMap[token]);
      }
    }

    return { restoredText, substitutions, found: true };
  }

  /** Restore every string value in an arbitrary JSON structure. */
  restoreDeep<T>(payload: T, sessionId: string): T {
    const tokenMap = this.vault.get(sessionId);
    if (!tokenMap) return payload;

    const tokens = Object.keys(tokenMap).sort((a, b) => b.length - a.length);

    const walk = (node: unknown): unknown => {
      if (typeof node === 'string') {
        let out = node;
        for (const token of tokens) out = out.split(token).join(tokenMap[token]);
        return out;
      }
      if (Array.isArray(node)) return node.map(walk);
      if (node && typeof node === 'object') {
        return Object.fromEntries(
          Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, walk(v)])
        );
      }
      return node;
    };

    return walk(payload) as T;
  }

  /** Wipe a session's encrypted mapping. Call this once the report is delivered. */
  destroySession(sessionId: string): void {
    this.vault.destroy(sessionId);
  }

  /**
   * Local gate: confirm no high-confidence PII survived before the redacted text
   * is handed to the graph builder.
   */
  verify(redactedText: string): { clean: boolean; leaks: Array<{ entity: string; sample: string }> } {
    const leaks: Array<{ entity: string; sample: string }> = [];

    for (const pattern of PATTERNS.filter((p) => p.confidence >= 0.9)) {
      const match = new RegExp(pattern.regex.source, pattern.regex.flags).exec(redactedText);
      if (match) leaks.push({ entity: pattern.name, sample: `${match[0].slice(0, 4)}…` });
    }

    return { clean: leaks.length === 0, leaks };
  }
}
