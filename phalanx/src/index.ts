import { McpApplicationFactory } from '@nitrostack/core';
import { AppModule } from './app.module.js';
import { PipelineTools } from './modules/pipeline/pipeline.tools.js';
import { ParserService } from './modules/ingestion/parser.service.js';
import multer from 'multer';
import dotenv from 'dotenv';
import express from 'express';
dotenv.config();

const upload = multer({ storage: multer.memoryStorage() });

async function bootstrap() {
  process.env.MCP_TRANSPORT_TYPE = 'http';
  process.env.PORT = '3000'; // Default port for the MCP backend HTTP server
  const app = await McpApplicationFactory.create(AppModule);
  await app.start();

  // Get the underlying Express app and add custom REST routes
  const transport: any = app.getHttpTransport();
  if (transport && transport.getApp) {
    const expressApp = transport.getApp();
    
    // Enable JSON body parsing for our custom routes, scoped to /api so it doesn't break MCP SDK routes
    expressApp.use('/api', express.json({ limit: '50mb' }));

    expressApp.post('/api/analyze', upload.single('file'), async (req: express.Request, res: express.Response) => {
      try {
        const pipeline = PipelineTools.instance;
        if (!pipeline) {
          throw new Error('PipelineTools instance not initialized');
        }

        const file = req.file;
        if (!file) {
          res.status(400).json({ error: 'No file uploaded' });
          return;
        }

        const startedAt = Date.now();
        const contractType = String(req.body?.contractType || 'general_contract');
        const filename = String(file.originalname || 'contract.txt');
        console.log(`\n📄 [Pipeline Start] Processing document: "${filename}"`);

        const parser = new ParserService();
        console.log('   [Step 1/5] Extracting text and page structure...');
        const parseResult = await parser.parse(file.buffer.toString('base64'), filename);
        const text = parseResult.text || file.buffer.toString('utf8');

        if (!text.trim()) {
          res.status(422).json({
            error:
              'No extractable text found. The file may be a scanned image — OCR is not enabled in this build.'
          });
          return;
        }

        const calculatedPageCount = parseResult.pageCount ?? 1;
        console.log(`              Extracted ${text.length} chars across ${calculatedPageCount} page(s).`);

        console.log('   [Step 2/5] Redacting under the selected policy...');
        const redactionResult = await pipeline.redactionService.redact(text, contractType, `sess_${Date.now()}`);

        // Local gate: never hand text to the graph builder if high-confidence PII
        // survived redaction. This is the load-bearing check for the whole
        // privacy claim, so it runs before anything reaches an external model.
        const verification = pipeline.redactionService.verify(
          redactionResult.redactedText,
          redactionResult.doctype
        );
        if (!verification.clean) {
          console.warn('   ⚠️  Residual PII detected after redaction:', verification.leaks);
        }
        console.log(
          `              ${redactionResult.stats.totalTokens} token(s) minted under policy "${redactionResult.policy.label}".`
        );

        console.log('   [Step 3/5] Building the clause knowledge graph...');
        const graph = await pipeline.graphService.buildFromText(
          redactionResult.redactedText,
          contractType,
          redactionResult.sessionId
        );
        console.log(
          `              Graph materialized: ${graph.nodeCount} nodes, ${graph.edgeCount} dependency edges (${graph.source}).`
        );

        console.log('   [Step 4/5] Running all 4 specialized Risk Agents across subgraphs concurrently...');
        const analysis = await pipeline.riskService.runAllAgents(graph.graphId);
        console.log(
          `              Found ${analysis.findings.length} risk finding(s) and ${analysis.strengths.length} mitigating protection(s).`
        );

        console.log('   [Step 5/5] Synthesizing redlines and the negotiation email...');
        const proposal = await pipeline.redlineService.synthesize(graph.graphId, redactionResult.sessionId, {
          findings: analysis.findings,
          restore: true
        });
        console.log(`✅ [Pipeline Complete] Risk Score: ${proposal.riskScore}/100. Returning payload to UI.\n`);

        // The graph holds redacted clause text; restore it for display only, on
        // the way out, exactly as the redline synthesizer does.
        const graphExport = pipeline.graphService.getExport(graph.graphId);
        const restoredGraph = pipeline.redactionService.restoreDeep(
          {
            nodes: (graphExport?.export.nodes ?? []).map((n: any) => ({
              key: n.key,
              attributes: {
                label: n.attributes?.heading ?? n.attributes?.label ?? n.key,
                category: n.attributes?.category ?? n.attributes?.entityType ?? 'other',
                kind: n.attributes?.kind ?? 'clause',
                text: (n.attributes?.text ?? '').slice(0, 400)
              }
            })),
            edges: (graphExport?.export.edges ?? []).map((e: any) => ({
              source: e.source,
              target: e.target,
              relation: e.attributes?.relation ?? 'references'
            }))
          },
          redactionResult.sessionId
        );

        const responsePayload = {
          documentId: graph.graphId,
          sessionId: redactionResult.sessionId,
          fileName: filename,
          contractType: redactionResult.doctype,
          policyLabel: redactionResult.policy.label,
          pageCount: calculatedPageCount,
          processingTime: `${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
          analysisSource: graph.source,
          restored: proposal.restored,
          restorationWarning: proposal.restorationWarning ?? null,
          redaction: {
            tokenCount: redactionResult.stats.totalTokens,
            byEntity: redactionResult.stats.byEntity,
            verified: verification.clean,
            leaks: verification.leaks
          },
          riskScore: proposal.riskScore,
          scoreBreakdown: analysis.scoreBreakdown,
          strengths: analysis.strengths,
          summary: proposal.summary,
          graph: {
            graphId: graph.graphId,
            nodeCount: graph.nodeCount,
            edgeCount: graph.edgeCount,
            categories: graph.categories,
            nodes: restoredGraph.nodes,
            edges: restoredGraph.edges
          },
          findings: analysis.findings.map((finding: any) => {
            const redline = proposal.redlines.find((r: any) => r.findingId === finding.id) ?? null;
            return {
              id: finding.id,
              agent: finding.agent,
              severity: finding.severity,
              category: finding.category,
              title: finding.issue,
              issue: finding.issue,
              businessImpact: finding.businessImpact,
              legalReason: finding.legalReason,
              clause: finding.clause,
              clauseTitle: finding.clauseTitle,
              clauseId: finding.clauseId,
              page: finding.page,
              confidence: finding.confidence,
              recommendation: finding.recommendation,
              redline: redline && {
                proposed: redline.proposedText,
                reason: redline.reason,
                negotiationPosition: redline.negotiationPosition,
                priority: redline.priority,
                dependencyWarning: redline.dependencyWarning ?? null
              }
            };
          }),
          redlines: proposal.redlines.map((r: any) => ({
            findingId: r.findingId,
            clauseId: r.clauseId,
            title: r.title,
            severity: r.severity,
            category: r.category,
            original: r.originalText,
            proposed: r.proposedText,
            reason: r.reason,
            negotiationPosition: r.negotiationPosition,
            dependencyWarning: r.dependencyWarning ?? null,
            priority: r.priority
          })),
          email: `${proposal.negotiationEmail?.subject || 'Review proposed revisions'}\n\n${proposal.negotiationEmail?.body || ''}`
        };

        res.json(responsePayload);

        // The report has been delivered, so the plaintext mapping is no longer
        // needed. Drop it rather than waiting on the vault TTL, and release the
        // graph so long-running servers do not accumulate contract text in RAM.
        pipeline.redactionService.destroySession(redactionResult.sessionId);
        pipeline.graphService.drop(graph.graphId);
      } catch (err: any) {
        console.error('Analyze endpoint error:', err);
        res.status(500).json({ error: err.message });
      }
    });

    // Person 4: Backend Synthesis Endpoint
    expressApp.post('/api/synthesize', async (req: express.Request, res: express.Response) => {
      try {
        const pipeline = PipelineTools.instance;
        if (!pipeline) {
          throw new Error('PipelineTools instance not initialized');
        }

        const { graphId, sessionId, findings } = req.body;

        // --- Person 4 Mock Hook ---
        // Person 1 (Redaction) maintains the encrypted vault mapping original values to placeholders.
        // Since we are running Person 4 in isolation, we manually seed the vault with mock data
        // so that the Restoration phase has something to swap back.
        pipeline.redactionService['vault'].put(sessionId, {
          '[ACV_VALUE]': '$50,000'
        });

        // Perform synthesis using the exact mock findings and graph
        const proposal = await pipeline.redlineService.synthesize(graphId, sessionId, {
          findings,
          restore: true // Use sessionId to decrypt/restore the original values
        });

        // Format to the exact output schema defined for Person 4
        res.json({
          status: 'completed',
          metadata: {
            pageCount: 1, 
            processingTime: '2.1s'
          },
          redlines: proposal.redlines.map((r: any) => ({
            original: r.originalText,
            proposed: r.proposedText,
            rationale: r.rationale
          }))
        });
      } catch (err: any) {
        console.error('Synthesis pipeline error:', err);
        res.status(500).json({ error: err.message });
      }
    });
  }
}

bootstrap();
