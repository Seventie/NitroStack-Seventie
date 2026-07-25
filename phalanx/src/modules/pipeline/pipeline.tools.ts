import { Injectable } from '@nitrostack/core';
import { RedlineService } from '../risk/redline.service.js';
import { RedactionService } from '../redaction/redaction.service.js';

@Injectable()
export class PipelineTools {
  static instance: PipelineTools;

  constructor(
    public redlineService: RedlineService,
    public redactionService: RedactionService
  ) {
    PipelineTools.instance = this;
  }
}
