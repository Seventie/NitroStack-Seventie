import { Injectable, ToolDecorator as Tool } from '@nitrostack/core';
import { z } from 'zod';
import { RedlineService } from '../risk/redline.service.js';
import { RedactionService } from '../redaction/redaction.service.js';
import { RiskService } from '../risk/risk.service.js';
import { GraphService } from '../graph/graph.service.js';

import { ParserService } from '../ingestion/parser.service.js';

@Injectable({ deps: [RedlineService, RedactionService, RiskService, GraphService, ParserService] })
export class PipelineTools {
  static instance: PipelineTools;

  constructor(
    public redlineService: RedlineService,
    public redactionService: RedactionService,
    public riskService: RiskService,
    public graphService: GraphService,
    public parserService: ParserService
  ) {
    PipelineTools.instance = this;
  }

  @Tool({
    name: 'run_full_pipeline',
    description: 'Run the entire contract analysis pipeline in one go. You can provide raw text, or provide a fileBase64 string (PDF/Word) to parse natively.',
    inputSchema: z.object({
      text: z.string().optional().describe('The raw extracted text of the contract. Use this if you already extracted the text.'),
      fileBase64: z.string().optional().describe('Base64 encoded file content of a PDF or Word Doc. Use this if you want the server to parse the file directly.'),
      filename: z.string().optional().describe('Original filename (required if using fileBase64, e.g. contract.pdf)'),
      contractType: z.string().optional().default('general_contract').describe('Type of contract (e.g. nda, saas_msa, general_contract)'),
      isBase64: z.boolean().optional().describe('Set to true if the text parameter is base64 encoded to bypass PII egress filters.')
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  })
  async runFullPipeline(input: any, ctx: any) {
    let { text, fileBase64, filename, contractType, isBase64 } = input;
    
    if (fileBase64 && filename) {
      ctx.logger.info('Parsing raw file directly', { filename });
      const parseResult = await this.parserService.parse(fileBase64, filename);
      text = parseResult.text;
    } else if (text && isBase64) {
      ctx.logger.info('Decoding base64 text payload');
      text = Buffer.from(text, 'base64').toString('utf8');
    }

    if (!text || !text.trim()) {
      return { error: 'No text provided or extracted. Please provide text or a valid fileBase64.' };
    }

    const sessionId = `sess_${Date.now()}`;
    
    ctx.logger.info('[Step 2/5] Redacting under the selected policy');
    const redactionResult = await this.redactionService.redact(text, contractType, sessionId);
    
    ctx.logger.info('[Step 3/5] Building the clause knowledge graph');
    const graph = await this.graphService.buildFromText(
      redactionResult.redactedText,
      contractType,
      sessionId
    );

    ctx.logger.info('[Step 4/5] Running all 4 specialized Risk Agents concurrently');
    const analysis = await this.riskService.runAllAgents(graph.graphId);

    ctx.logger.info('[Step 5/5] Synthesizing redlines and the negotiation email');
    const proposal = await this.redlineService.synthesize(graph.graphId, sessionId, {
      findings: analysis.findings,
      restore: true
    });

    const responsePayload = {
      documentId: graph.graphId,
      sessionId,
      contractType,
      riskScore: proposal.riskScore,
      scoreBreakdown: analysis.scoreBreakdown,
      strengths: analysis.strengths,
      summary: proposal.summary,
      findings: analysis.findings.map((finding: any) => {
        const redline = proposal.redlines.find((r: any) => r.findingId === finding.id) ?? null;
        return {
          agent: finding.agent,
          severity: finding.severity,
          title: finding.issue,
          businessImpact: finding.businessImpact,
          recommendation: finding.recommendation,
          redline: redline ? { proposed: redline.proposedText, reason: redline.reason } : null
        };
      })
    };

    return responsePayload;
  }
}
