import { Injectable } from '@nitrostack/core';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

@Injectable()
export class ParserService {
  async parse(base64: string, filename: string): Promise<{ text: string }> {
    const buffer = Buffer.from(base64, 'base64');
    let text = '';

    if (filename.endsWith('.pdf')) {
      const render_page = function (pageData: any) {
        const render_options = { normalizeWhitespace: false, disableCombineTextItems: false };
        return pageData.getTextContent(render_options).then(function(textContent: any) {
          let lastY, text = '';
          for (let item of textContent.items) {
            if (lastY == item.transform[5] || !lastY) text += item.str;
            else text += '\n' + item.str;
            lastY = item.transform[5];
          }
          return `\n---PAGE_${pageData.pageIndex + 1}---\n` + text;
        });
      };
      const data = await pdfParse(buffer, { pagerender: render_page });
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
