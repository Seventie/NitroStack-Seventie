import { Injectable } from '@nitrostack/core';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

@Injectable()
export class ParserService {
  async parse(base64: string, filename: string): Promise<{ text: string }> {
    const buffer = Buffer.from(base64, 'base64');
    let text = '';

    if (filename.endsWith('.pdf')) {
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (filename.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      // fallback to plain text
      text = buffer.toString('utf-8');
    }

    return { text };
  }
}
