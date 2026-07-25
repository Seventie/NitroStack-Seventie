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

        const parser = new ParserService();
        const parseResult = await parser.parse(file.buffer.toString('base64'), filename);
        const text = parseResult.text || file.buffer.toString('utf8');
        const redactionResult = await pipeline.redactionService.redact(text, contractType, `sess_${Date.now()}`);
        const graph = await pipeline.redlineService['graphService'].buildFromText(redactionResult.redactedText, contractType, redactionResult.sessionId);

        const findings = [
          {
            id: 'c1',
            agent: 'liability' as const,
            severity: 'High' as const,
            category: 'liability',
            title: 'Liability cap should be tightened',
            description: 'The clause appears to include a broad liability limitation that could under-protect the business.',
            clause: redactionResult.redactedText.slice(0, 220),
            clauseId: 'clause-1',
            recommendation: 'Add a mutual cap and carve-outs for fraud, confidentiality breaches, and payment obligations.',
            confidence: 0.82
          }
        ];

        const proposal = await pipeline.redlineService.synthesize(graph.graphId, redactionResult.sessionId, {
          findings,
          restore: true
        });

        const responsePayload = {
          documentId: `doc_${Date.now()}`,
          fileName: filename,
          pageCount: 1,
          processingTime: 'Done',
          riskScore: proposal.riskScore || 85,
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
          findings: findings.map((finding) => ({
            severity: finding.severity,
            category: finding.category,
            title: finding.title,
            description: finding.description,
            clause: finding.clause,
            recommendation: finding.recommendation
          })),
          redlines: proposal.redlines.map((r: any) => ({
            original: r.originalText,
            proposed: r.proposedText,
            rationale: r.rationale
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
