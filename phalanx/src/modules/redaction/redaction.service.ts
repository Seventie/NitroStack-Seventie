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
  regexEntities: string[];
  contextEntities: string[];
  preserve: string[];
}

interface LegalRuleSet {
  version: string;
  documentProfiles?: Array<{
    doctype: string;
    redact: string[];
    anonymize: string[];
    preserve: string[];
  }>;
}

interface ModelEntity {
  entity: string;
  start: number;
  end: number;
  value: string;
  confidence: number;
  source: 'regex' | 'context' | 'hf' | 'spacy' | 'gliner';
}

type Action = 'redact' | 'anonymize' | 'preserve';

interface SelectedEntity extends ModelEntity {
  action: Action;
}

export interface RedactionResult {
  sessionId: string;
  doctype: string;
  policy: { label: string; regexEntities: string[]; contextEntities: string[]; preserve: string[] };
  redactedText: string;
  tokenIndex: Record<string, string>;
  stats: {
    totalTokens: number;
    byEntity: Record<string, number>;
    tokenizer: { tokenCount: number };
    detections: { regex: number; context: number; hf: number; spacy: number; gliner: number; selected: number };
  };
  pipeline: {
    legalRulesVersion: string;
    providerStatus: {
      spacyEndpoint: boolean;
      huggingFace: boolean;
      nvidiaGLiNER: boolean;
    };
    audit: Array<{
      entity: string;
      action: Action;
      source: string;
      token?: string;
      sample: string;
    }>;
  };
}

interface Pattern {
  name: string;
  regex: RegExp;
  confidence: number;
}

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
  { name: 'MONEY', regex: /(?:(?:US\$|\$|₹|€|£)\s?\d[\d,.]*(?:\s?(?:million|billion|mn|bn|k|M|B))?)|(?:\b(?:USD|EUR|GBP|INR|AUD|CAD)\s?\d[\d,.]*(?:\s?(?:million|billion|mn|bn|k|M|B))?)|(?:\b\d[\d,.]*\s?(?:USD|EUR|GBP|INR|AUD|CAD)\b)/g, confidence: 0.9 },
  { name: 'PERCENTAGE', regex: /\b\d{1,3}(?:\.\d+)?\s?(?:%|percent)\b/gi, confidence: 0.75 }
];

const CONTEXT_RULES: Array<{ name: string; regex: RegExp; group: number }> = [
  { name: 'CLIENT_NAME', regex: /\b([A-Z][A-Za-z0-9&.,'-]*(?:\s+[A-Z][A-Za-z0-9&.,'-]*){0,5}\s+(?:Inc\.?|LLC|L\.L\.C\.|Ltd\.?|Limited|GmbH|Pvt\.?\s?Ltd\.?|Corp\.?|Corporation|Company|Co\.|PLC|LLP|S\.A\.|B\.V\.))/g, group: 1 },
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
  { name: 'ACV_VALUE', regex: /\b(?:Annual Contract Value|ACV|Total Contract Value|TCV|Annual Recurring Revenue|ARR)\s*(?:of|:|=|shall be)?\s*((?:US\$|\$|₹|€|£)?\s?\d[\d,.]*(?:\s?(?:million|billion|mn|bn|k|M|B))?)/gi, group: 1 }
];

const ENTITY_STOPWORDS = new Set([
  'The Agreement', 'This Agreement', 'The Parties', 'The Party', 'Effective Date',
  'Exhibit A', 'Exhibit B', 'Schedule A', 'Schedule B', 'Section', 'Article',
  'Confidential Information', 'Intellectual Property', 'Force Majeure',
  'Customer', 'Provider', 'Vendor', 'Supplier', 'Company', 'Corporation'
]);

const DOCTYPE_ALIASES: Record<string, string> = {
  msa: 'saas_msa',
  saas: 'saas_msa',
  enterprise: 'enterprise_agreement',
  dpa_contract: 'dpa',
  non_disclosure_agreement: 'nda',
  rental: 'rental_lease',
  lease: 'rental_lease',
  construction: 'construction_contract',
  epc: 'construction_contract',
  purchase: 'supply_purchase_agreement',
  supply: 'supply_purchase_agreement',
  procurement: 'supply_purchase_agreement',
  manufacturing: 'manufacturing_agreement',
  license: 'licensing_agreement',
  licensing: 'licensing_agreement',
  reseller: 'distribution_reseller_agreement',
  distribution: 'distribution_reseller_agreement',
  financing: 'loan_financing_agreement',
  loan: 'loan_financing_agreement',
  employment: 'employment_contract',
  joint_venture: 'partnership_joint_venture',
  partnership: 'partnership_joint_venture'
};

const HF_LABEL_MAP: Record<string, string> = {
  PER: 'PERSON_NAME',
  PERSON: 'PERSON_NAME',
  ORG: 'ORG_NAME',
  LOC: 'POSTAL_ADDRESS',
  GPE: 'POSTAL_ADDRESS',
  MISC: 'PROJECT_CODENAME'
};

const SPACY_LABEL_MAP: Record<string, string> = {
  PERSON: 'PERSON_NAME',
  ORG: 'ORG_NAME',
  GPE: 'POSTAL_ADDRESS',
  LOC: 'POSTAL_ADDRESS',
  FAC: 'POSTAL_ADDRESS',
  MONEY: 'MONEY',
  PERCENT: 'PERCENTAGE',
  NORP: 'AFFILIATE_NAME'
};

const GLINER_LABEL_MAP: Record<string, string> = {
  person: 'PERSON_NAME',
  'person name': 'PERSON_NAME',
  name: 'PERSON_NAME',
  organization: 'ORG_NAME',
  company: 'CLIENT_NAME',
  'client name': 'CLIENT_NAME',
  'vendor name': 'VENDOR_NAME',
  address: 'POSTAL_ADDRESS',
  location: 'POSTAL_ADDRESS',
  gpe: 'POSTAL_ADDRESS',
  email: 'EMAIL_ADDRESS',
  'email address': 'EMAIL_ADDRESS',
  phone: 'PHONE_NUMBER',
  'phone number': 'PHONE_NUMBER',
  ssn: 'US_SSN',
  'social security number': 'US_SSN',
  'credit card': 'CREDIT_CARD',
  'bank account': 'BANK_ACCOUNT',
  iban: 'IBAN',
  aadhaar: 'AADHAAR',
  pan: 'PAN',
  money: 'MONEY',
  'financial value': 'MONEY',
  acv: 'ACV_VALUE',
  'annual contract value': 'ACV_VALUE',
  jurisdiction: 'JURISDICTION',
  signatory: 'SIGNATORY_NAME',
  'signatory name': 'SIGNATORY_NAME',
  'trade secret': 'TRADE_SECRET',
  codename: 'PROJECT_CODENAME',
  'project codename': 'PROJECT_CODENAME'
};

@Injectable()
export class RedactionService {
  private policies: Record<string, RedactionPolicy> = {};
  private legalRules: LegalRuleSet = { version: 'unavailable' };

  constructor(private vault: SessionVaultService) {
    this.loadPolicies();
    this.loadLegalRules();
  }

  private loadPolicies() {
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

  private loadLegalRules() {
    const candidates = [
      path.resolve(__dirname, '../../../data/legal-rules.json'),
      path.resolve(process.cwd(), 'data/legal-rules.json')
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        this.legalRules = JSON.parse(fs.readFileSync(candidate, 'utf8')) as LegalRuleSet;
        return;
      }
    }

    this.legalRules = { version: 'missing' };
    console.warn('[redaction] legal-rules file not found; legal profile fallback will be used');
  }

  listPolicies(): Array<{ doctype: string; label: string; description: string }> {
    return Object.entries(this.policies).map(([doctype, p]) => ({
      doctype,
      label: p.label,
      description: p.description
    }));
  }

  resolvePolicy(doctype: string): { key: string; policy: RedactionPolicy } {
    const normalized = (doctype || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
    const requested = DOCTYPE_ALIASES[normalized] || normalized;

    if (this.policies[requested]) return { key: requested, policy: this.policies[requested] };
    if (this.policies.general_contract) return { key: 'general_contract', policy: this.policies.general_contract };

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

  private resolveLegalProfile(doctype: string): { redact: Set<string>; anonymize: Set<string>; preserve: Set<string> } {
    const profile = this.legalRules.documentProfiles?.find((p) => p.doctype === doctype);

    if (!profile) {
      return {
        redact: new Set(['US_SSN', 'AADHAAR', 'PAN', 'CREDIT_CARD', 'BANK_ACCOUNT', 'IBAN']),
        anonymize: new Set(['EMAIL_ADDRESS', 'PHONE_NUMBER', 'PERSON_NAME', 'SIGNATORY_NAME']),
        preserve: new Set(['JURISDICTION', 'MONEY', 'PERCENTAGE'])
      };
    }

    return {
      redact: new Set(profile.redact || []),
      anonymize: new Set(profile.anonymize || []),
      preserve: new Set(profile.preserve || [])
    };
  }

  private tokenize(text: string): Array<{ token: string; start: number; end: number }> {
    const out: Array<{ token: string; start: number; end: number }> = [];
    const re = /\S+/g;
    for (const match of text.matchAll(re)) {
      const start = match.index ?? 0;
      const value = match[0];
      out.push({ token: value, start, end: start + value.length });
    }
    return out;
  }

  private detectContextEntities(text: string, policy: RedactionPolicy): ModelEntity[] {
    const entities: ModelEntity[] = [];
    for (const rule of CONTEXT_RULES) {
      if (!policy.contextEntities.includes(rule.name)) continue;

      const rx = new RegExp(rule.regex.source, rule.regex.flags);
      for (const match of text.matchAll(rx)) {
        const captured = (match[rule.group] || '').trim().replace(/[.,;:]+$/, '');
        if (!captured || captured.length < 2 || ENTITY_STOPWORDS.has(captured)) continue;

        const whole = match[0];
        const wholeStart = match.index ?? -1;
        if (wholeStart < 0) continue;

        const relative = whole.indexOf(captured);
        const start = relative >= 0 ? wholeStart + relative : wholeStart;
        const end = start + captured.length;

        entities.push({
          entity: rule.name,
          start,
          end,
          value: captured,
          confidence: 0.86,
          source: 'context'
        });
      }
    }
    return entities;
  }

  private detectRegexEntities(text: string, policy: RedactionPolicy): ModelEntity[] {
    const entities: ModelEntity[] = [];
    for (const pattern of PATTERNS) {
      if (!policy.regexEntities.includes(pattern.name)) continue;

      const rx = new RegExp(pattern.regex.source, pattern.regex.flags);
      for (const match of text.matchAll(rx)) {
        const start = match.index ?? -1;
        if (start < 0) continue;
        const value = match[0];
        entities.push({
          entity: pattern.name,
          start,
          end: start + value.length,
          value,
          confidence: pattern.confidence,
          source: 'regex'
        });
      }
    }
    return entities;
  }

  private chunkText(text: string, size = 2500): Array<{ text: string; offset: number }> {
    const chunks: Array<{ text: string; offset: number }> = [];
    for (let i = 0; i < text.length; i += size) {
      chunks.push({ text: text.slice(i, i + size), offset: i });
    }
    return chunks;
  }

  private mapHfLabel(label?: string): string | null {
    if (!label) return null;
    const normalized = label.replace(/^B-/, '').replace(/^I-/, '').toUpperCase();
    return HF_LABEL_MAP[normalized] || null;
  }

  private mapSpacyLabel(label?: string): string | null {
    if (!label) return null;
    return SPACY_LABEL_MAP[label.toUpperCase()] || null;
  }

  private async detectWithHuggingFace(text: string): Promise<ModelEntity[]> {
    const apiKey = process.env.HF_API_KEY;
    if (!apiKey) return [];

    const model = process.env.HF_NER_MODEL || 'dslim/bert-base-NER';
    const url = `https://api-inference.huggingface.co/models/${model}`;
    const entities: ModelEntity[] = [];

    for (const chunk of this.chunkText(text)) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: chunk.text,
            parameters: { aggregation_strategy: 'simple' },
            options: { wait_for_model: true }
          })
        });

        if (!resp.ok) continue;
        const data = (await resp.json()) as any;
        const rows = Array.isArray(data) ? data : [];

        for (const row of rows) {
          const mapped = this.mapHfLabel(row.entity_group || row.entity);
          if (!mapped) continue;
          const start = Number(row.start);
          const end = Number(row.end);
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

          const value = chunk.text.slice(start, end);
          entities.push({
            entity: mapped,
            start: chunk.offset + start,
            end: chunk.offset + end,
            value,
            confidence: Number(row.score ?? 0.7),
            source: 'hf'
          });
        }
      } catch {
        // Provider failures are non-fatal; pipeline continues with available detectors.
      }
    }

    return entities;
  }

  private async detectWithSpacy(text: string, doctype: string): Promise<ModelEntity[]> {
    const endpoint = process.env.SPACY_NER_URL;
    if (!endpoint) return [];

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, doctype })
      });

      if (!resp.ok) return [];
      const payload = (await resp.json()) as any;
      const rows = Array.isArray(payload?.entities) ? payload.entities : [];

      const entities: ModelEntity[] = [];
      for (const row of rows) {
        const mapped = this.mapSpacyLabel(row.label);
        if (!mapped) continue;

        const start = Number(row.start);
        const end = Number(row.end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

        const value = typeof row.text === 'string' && row.text.length > 0 ? row.text : text.slice(start, end);
        entities.push({
          entity: mapped,
          start,
          end,
          value,
          confidence: Number(row.score ?? 0.8),
          source: 'spacy'
        });
      }

      return entities;
    } catch {
      return [];
    }
  }

  private mapGlinerLabel(label?: string): string | null {
    if (!label) return null;
    const clean = label.trim().toLowerCase().replace(/_/g, ' ');
    if (GLINER_LABEL_MAP[clean]) return GLINER_LABEL_MAP[clean];
    const upper = label.trim().toUpperCase().replace(/[\s-]+/g, '_');
    return upper;
  }

  private async detectWithGLiNER(text: string, doctype: string): Promise<ModelEntity[]> {
    const apiKey = process.env.NVIDIA_API_KEY || process.env.NVIDIA_GLINER_API_KEY;
    const url = process.env.NVIDIA_GLINER_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
    const model = process.env.NVIDIA_GLINER_MODEL || 'nvidia/gliner-pii';

    if (!apiKey) return [];

    const entities: ModelEntity[] = [];

    for (const chunk of this.chunkText(text, 2000)) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content:
                  'You are NVIDIA GLiNER-PII entity extraction engine. Extract all PII, financial figures, legal party names, addresses, and sensitive entities. Respond ONLY with a JSON array of objects: [{"entity": "label", "value": "extracted text", "start": offset, "end": offset}].'
              },
              {
                role: 'user',
                content: chunk.text
              }
            ],
            temperature: 0.1
          })
        });

        if (!resp.ok) continue;
        const data = (await resp.json()) as any;
        const content = data?.choices?.[0]?.message?.content || (Array.isArray(data) ? JSON.stringify(data) : '');

        let parsed: any[] = [];
        try {
          const match = content.match(/\[[\s\S]*\]/);
          if (match) parsed = JSON.parse(match[0]);
        } catch {}

        for (const row of parsed) {
          const mapped = this.mapGlinerLabel(row.entity || row.label || row.type);
          if (!mapped) continue;

          let val = (row.value || row.text || '').trim();
          let start = Number(row.start);
          let end = Number(row.end);

          // Verify if start/end slice inside a word or if value was not given at exact offset
          const isWordBoundaryStart = start === 0 || !/[A-Za-z0-9]/.test(chunk.text[start - 1] || '');
          const isWordBoundaryEnd = end >= chunk.text.length || !/[A-Za-z0-9]/.test(chunk.text[end] || '');

          if (!val && Number.isFinite(start) && Number.isFinite(end) && end > start) {
            val = chunk.text.slice(start, end);
          } else if (val && (!Number.isFinite(start) || start < 0 || !isWordBoundaryStart || !isWordBoundaryEnd)) {
            const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const wordRx = new RegExp(`\\b${escaped}\\b`, 'i');
            const match = wordRx.exec(chunk.text);
            if (match && match.index !== undefined) {
              start = match.index;
              end = start + match[0].length;
              val = match[0];
            } else if (!Number.isFinite(start) || start < 0) {
              start = chunk.text.indexOf(val);
              end = start + val.length;
            }
          }

          if (!val || start < 0) continue;

          entities.push({
            entity: mapped,
            start: chunk.offset + start,
            end: chunk.offset + end,
            value: val,
            confidence: Number(row.confidence ?? row.score ?? 0.92),
            source: 'gliner'
          });
        }
      } catch {
        // NVIDIA GLiNER provider failures are non-fatal; pipeline continues.
      }
    }

    return entities;
  }

  private decideAction(entity: string, legalProfile: { redact: Set<string>; anonymize: Set<string>; preserve: Set<string> }): Action {
    if (legalProfile.preserve.has(entity)) return 'preserve';
    if (legalProfile.redact.has(entity)) return 'redact';
    if (legalProfile.anonymize.has(entity)) return 'anonymize';

    if (entity === 'MONEY' || entity === 'PERCENTAGE' || entity === 'JURISDICTION') return 'preserve';
    return 'anonymize';
  }

  private pickNonOverlapping(candidates: SelectedEntity[]): SelectedEntity[] {
    const sorted = [...candidates].sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return (b.end - b.start) - (a.end - a.start);
    });

    const rank = (e: SelectedEntity): number => {
      const actionWeight = e.action === 'redact' ? 3 : e.action === 'anonymize' ? 2 : 1;
      return actionWeight * 1000 + Math.floor(e.confidence * 100) + (e.end - e.start);
    };

    const selected: SelectedEntity[] = [];
    for (const c of sorted) {
      if (c.end <= c.start || c.value.includes('[') || c.value.includes(']')) continue;

      const last = selected[selected.length - 1];
      if (!last || c.start >= last.end) {
        selected.push(c);
        continue;
      }

      if (rank(c) > rank(last)) {
        selected[selected.length - 1] = c;
      }
    }

    return selected.filter((e) => e.action !== 'preserve');
  }

  async redact(
    text: string,
    doctype: string,
    sessionId?: string,
    metadata?: Record<string, unknown>
  ): Promise<RedactionResult> {
    const { key, policy } = this.resolvePolicy(doctype);
    const legalProfile = this.resolveLegalProfile(key);
    const session = sessionId || `sess_${crypto.randomBytes(8).toString('hex')}`;

    const tokenMap: Record<string, string> = {};
    const tokenIndex: Record<string, string> = {};
    const byEntity: Record<string, number> = {};
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

    const tokenizerOutput = this.tokenize(text);

    const contextHits = this.detectContextEntities(text, policy);
    const regexHits = this.detectRegexEntities(text, policy);
    const [spacyHits, hfHits, glinerHits] = await Promise.all([
      this.detectWithSpacy(text, key),
      this.detectWithHuggingFace(text),
      this.detectWithGLiNER(text, key)
    ]);

    const candidates: SelectedEntity[] = [
      ...contextHits,
      ...regexHits,
      ...spacyHits,
      ...hfHits,
      ...glinerHits
    ].map((hit) => ({
      ...hit,
      action: this.decideAction(hit.entity, legalProfile)
    }));

    const selected = this.pickNonOverlapping(candidates);

    let output = '';
    let cursor = 0;
    const audit: RedactionResult['pipeline']['audit'] = [];

    for (const hit of selected) {
      if (hit.start < cursor) continue;
      output += text.slice(cursor, hit.start);

      const token = mint(hit.entity, hit.value);
      output += token;
      cursor = hit.end;

      audit.push({
        entity: hit.entity,
        action: hit.action,
        source: hit.source,
        token,
        sample: `${hit.value.slice(0, 8)}${hit.value.length > 8 ? '...' : ''}`
      });
    }

    output += text.slice(cursor);

    if (metadata) {
      const metadataKeys = ['lasteditedby', 'last_modified_by', 'author', 'company'];
      for (const [k, v] of Object.entries(metadata)) {
        if (metadataKeys.includes(k.toLowerCase()) && typeof v === 'string' && v.trim()) {
          audit.push({
            entity: 'DOC_METADATA',
            action: 'redact',
            source: 'metadata',
            sample: `${k}:${v.slice(0, 8)}${v.length > 8 ? '...' : ''}`
          });
        }
      }
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
      redactedText: output,
      tokenIndex,
      stats: {
        totalTokens: Object.keys(tokenMap).length,
        byEntity,
        tokenizer: { tokenCount: tokenizerOutput.length },
        detections: {
          regex: regexHits.length,
          context: contextHits.length,
          hf: hfHits.length,
          spacy: spacyHits.length,
          gliner: glinerHits.length,
          selected: selected.length
        }
      },
      pipeline: {
        legalRulesVersion: this.legalRules.version || 'unknown',
        providerStatus: {
          spacyEndpoint: !!process.env.SPACY_NER_URL,
          huggingFace: !!process.env.HF_API_KEY,
          nvidiaGLiNER: !!(process.env.NVIDIA_API_KEY || process.env.NVIDIA_GLINER_API_KEY)
        },
        audit
      }
    };
  }

  restore(text: string, sessionId: string): { restoredText: string; substitutions: number; found: boolean } {
    const tokenMap = this.vault.get(sessionId);
    if (!tokenMap) return { restoredText: text, substitutions: 0, found: false };

    let restoredText = text;
    let substitutions = 0;

    for (const token of Object.keys(tokenMap).sort((a, b) => b.length - a.length)) {
      const parts = restoredText.split(token);
      if (parts.length > 1) {
        substitutions += parts.length - 1;
        restoredText = parts.join(tokenMap[token]);
      }
    }

    return { restoredText, substitutions, found: true };
  }

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

  destroySession(sessionId: string): void {
    this.vault.destroy(sessionId);
  }

  verify(redactedText: string, doctype?: string): { clean: boolean; leaks: Array<{ entity: string; sample: string }> } {
    const leaks: Array<{ entity: string; sample: string }> = [];
    const legalProfile = doctype ? this.resolveLegalProfile(doctype) : null;

    for (const pattern of PATTERNS.filter((p) => p.confidence >= 0.9)) {
      if (legalProfile && legalProfile.preserve.has(pattern.name)) {
        // Intentionally preserved under legal policy for downstream risk analysis
        continue;
      }
      const match = new RegExp(pattern.regex.source, pattern.regex.flags).exec(redactedText);
      if (match) leaks.push({ entity: pattern.name, sample: `${match[0].slice(0, 4)}…` });
    }

    return { clean: leaks.length === 0, leaks };
  }
}

