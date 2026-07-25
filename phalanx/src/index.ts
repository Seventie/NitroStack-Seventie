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
    
    // Enable JSON body parsing for our custom routes
    expressApp.use(express.json());

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

        const contractType = String(req.body?.contractType || 'general_contract');
        const filename = String(file.originalname || 'contract.txt');
        console.log(`\n📄 [Pipeline Start] Processing document: "${filename}"`);

        const parser = new ParserService();
        console.log('   [Step 1/4] Extracting text and preserving multi-page numbering...');
        const parseResult = await parser.parse(file.buffer.toString('base64'), filename);
        const text = parseResult.text || file.buffer.toString('utf8');
        const calculatedPageCount = (text.match(/---PAGE_\d+---/g) || []).length || 1;
        console.log(`              Extracted ${text.length} chars across ~${calculatedPageCount} page(s).`);

        console.log('   [Step 2/4] Executing PII token redaction & building complete Knowledge Graph...');
        const redactionResult = await pipeline.redactionService.redact(text, contractType, `sess_${Date.now()}`);
        const graph = await pipeline.graphService.buildFromText(redactionResult.redactedText, contractType, redactionResult.sessionId);
        console.log(`              Graph materialized: ${graph.nodeCount} nodes, ${graph.edgeCount} dependency edges.`);

        console.log('   [Step 3/4] Running all 4 specialized Risk Agents across subgraphs concurrently...');
        const analysis = await pipeline.riskService.runAllAgents(graph.graphId);
        console.log(`              Found ${analysis.findings.length} risk finding(s) and ${analysis.strengths.length} mitigating protection(s).`);

        console.log('   [Step 4/4] Synthesizing professional redlines and prioritized negotiation email...');
        const proposal = await pipeline.redlineService.synthesize(graph.graphId, redactionResult.sessionId, {
          findings: analysis.findings,
          restore: true
        });
        console.log(`✅ [Pipeline Complete] Risk Score: ${proposal.riskScore}/100. Returning payload to UI.\n`);

        const responsePayload = {
          documentId: `doc_${Date.now()}`,
          fileName: filename,
          pageCount: calculatedPageCount,
          processingTime: 'Done',
          riskScore: proposal.riskScore || 85,
          scoreBreakdown: analysis.scoreBreakdown,
          strengths: analysis.strengths,
          summary: proposal.summary || 'The document was analyzed successfully.',
          graph: {
            graphId: graph.graphId,
            nodeCount: graph.nodeCount,
            edgeCount: graph.edgeCount,
            nodes: Array.from({ length: Math.min(graph.nodeCount, 6) }, (_, index) => ({
              key: `c${index + 1}`,
              attributes: { label: `Clause ${index + 1}`, category: 'clause', text: redactionResult.redactedText.slice(0, 120) }
            })),
            edges: []
          },
          findings: analysis.findings.map((finding: any) => ({
            severity: finding.severity,
            category: finding.category,
            title: finding.issue, // Map issue to title for frontend or update frontend
            issue: finding.issue,
            businessImpact: finding.businessImpact,
            legalReason: finding.legalReason,
            clause: finding.clause,
            clauseTitle: finding.clauseTitle,
            page: finding.page,
            confidence: finding.confidence,
            recommendation: finding.recommendation
          })),
          redlines: proposal.redlines.map((r: any) => ({
            original: r.originalText,
            proposed: r.proposedText,
            reason: r.reason,
            negotiationPosition: r.negotiationPosition,
            priority: r.priority
          })),
          email: `${proposal.negotiationEmail?.subject || 'Review proposed revisions'}\n\n${proposal.negotiationEmail?.body || ''}`
        };

        res.json(responsePayload);
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
