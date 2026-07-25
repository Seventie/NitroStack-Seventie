import { useState, useRef } from 'react';

/**
 * Contract types the backend has a redaction policy for. The `value` strings
 * must match the policy keys in src/data/redaction-policies.json — they are
 * passed straight through to redact_document as `doctype`.
 */
export const CONTRACT_TYPES = [
  {
    value: 'saas_msa',
    label: 'SaaS Master Service Agreement',
    hint: 'Scrubs ACV and banking details; preserves legal entity names for diligence.'
  },
  {
    value: 'enterprise_agreement',
    label: 'Enterprise Agreement',
    hint: 'Scrubs commercial terms, headcount, and internal system identifiers.'
  },
  {
    value: 'nda',
    label: 'Non-Disclosure Agreement',
    hint: 'Scrubs trade secrets, project code names, and disclosed-material descriptions.'
  },
  {
    value: 'dpa',
    label: 'Data Processing Agreement',
    hint: 'Scrubs data-subject categories, sub-processor names, and data-centre locations.'
  },
  {
    value: 'general_contract',
    label: 'Other / General Contract',
    hint: 'Baseline policy: standard PII, financial figures, and identifiers.'
  }
];

const VALID_EXTENSIONS = ['pdf', 'docx', 'txt'];
const VALID_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
];

export default function UploadZone({ onUpload }) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [contractType, setContractType] = useState('saas_msa');
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const selectedType = CONTRACT_TYPES.find((t) => t.value === contractType);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const handleFileInput = (e) => {
    if (e.target.files?.length) handleFiles(e.target.files);
  };

  const handleFiles = (files) => {
    const candidate = files[0];
    const extension = candidate.name.split('.').pop().toLowerCase();

    if (!VALID_MIME_TYPES.includes(candidate.type) && !VALID_EXTENSIONS.includes(extension)) {
      setError('Unsupported file. Upload a PDF, DOCX, or TXT file.');
      setFile(null);
      return;
    }

    setError(null);
    setFile(candidate);
  };

  // The contract type is a required, explicit user decision — it selects the
  // redaction policy schema, so we never infer it silently from the document.
  const startAnalysis = () => {
    if (!file) {
      setError('Select a contract file first.');
      return;
    }
    onUpload(file, contractType);
  };

  const clearFile = (e) => {
    e.stopPropagation();
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="upload-container">
      <div
        className={`upload-zone ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInput}
          style={{ display: 'none' }}
          accept=".pdf,.docx,.txt"
        />

        {file ? (
          <>
            <div className="upload-icon">✓</div>
            <h2 className="mono" style={{ wordBreak: 'break-all' }}>{file.name}</h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              {(file.size / 1024).toFixed(1)} KB — ready to analyze
            </p>
            <button style={{ marginTop: '1rem' }} onClick={clearFile}>
              Choose a different file
            </button>
          </>
        ) : (
          <>
            <div className="upload-icon">📄</div>
            <h2>Drag &amp; Drop Contract</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Supports PDF, DOCX, and TXT files</p>
            <button style={{ marginTop: '1rem' }}>Browse Files</button>
          </>
        )}
      </div>

      <div className="contract-type-panel">
        <label htmlFor="contract-type" className="field-label">
          Contract Type
        </label>
        <p className="field-help">
          This selects the redaction policy applied before anything leaves your machine.
        </p>

        <select
          id="contract-type"
          className="contract-type-select mono"
          value={contractType}
          onChange={(e) => setContractType(e.target.value)}
        >
          {CONTRACT_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>

        {selectedType && <p className="policy-hint">{selectedType.hint}</p>}
      </div>

      {error && <div className="upload-error">{error}</div>}

      <div className="action-buttons">
        <button className="primary" onClick={startAnalysis} disabled={!file}>
          Analyze Contract
        </button>
      </div>
    </div>
  );
}
