import { Injectable } from '@nitrostack/core';
import { RedlineService } from '../risk/redline.service.js';
import { RedactionService } from '../redaction/redaction.service.js';
import { RiskService } from '../risk/risk.service.js';
import { GraphService } from '../graph/graph.service.js';

@Injectable()
export class PipelineTools {
  static instance: PipelineTools;

  constructor(
    public redlineService: RedlineService,
    public redactionService: RedactionService,
    public riskService: RiskService,
    public graphService: GraphService
  ) {
    PipelineTools.instance = this;
  }
}
