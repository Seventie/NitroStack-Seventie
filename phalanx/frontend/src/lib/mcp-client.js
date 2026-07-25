/**
 * Runs the real ingest → redact → graph → risk → redline pipeline for the UI.
 */
export async function analyzeDocument(file, contractType) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('contractType', contractType || 'general_contract');

  const response = await fetch('/api/analyze', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Analysis request failed');
  }

  const result = await response.json();

  return {
    metadata: {
      documentId: result.documentId || `doc_${Math.random().toString(36).substr(2, 9)}`,
      fileName: result.fileName || file.name,
      source: 'ai',
      riskScore: result.riskScore || 0,
      pageCount: result.pageCount || 1,
      processingTime: result.processingTime || 'Done'
    },
    summary: result.summary || 'The document was analyzed successfully.',
    graph: result.graph || null,
    findings: result.findings || [],
    redlines: result.redlines || [],
    email: result.email || ''
  };
}
