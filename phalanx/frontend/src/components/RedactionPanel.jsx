import { useState } from 'react';
import { restoreText } from '../lib/mcp-client';

export default function RedactionPanel({ redactionData, fileName }) {
  const [viewMode, setViewMode] = useState('redacted'); // 'redacted' | 'restored'
  const [restoredText, setRestoredText] = useState(null);
  const [loadingRestore, setLoadingRestore] = useState(false);
  const [activeTab, setActiveTab] = useState('viewer'); // 'viewer' | 'audit' | 'stats'
  const [copied, setCopied] = useState(false);

  if (!redactionData) return null;

  const {
    sessionId,
    doctype,
    policy,
    redactedText,
    tokenIndex,
    stats,
    pipeline,
    verification
  } = redactionData;

  const handleToggleView = async (mode) => {
    setViewMode(mode);
    if (mode === 'restored' && !restoredText && sessionId) {
      setLoadingRestore(true);
      try {
        const res = await restoreText(redactedText, sessionId);
        setRestoredText(res.restoredText || 'Failed to restore text.');
      } catch (err) {
        console.error('Failed to restore text:', err);
        setRestoredText('Error executing restore_text tool.');
      } finally {
        setLoadingRestore(false);
      }
    }
  };

  const handleCopy = () => {
    const textToCopy = viewMode === 'restored' ? (restoredText || redactedText) : redactedText;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Format tokens in redacted text for visual highlighting
  const renderHighlightedText = (text) => {
    if (!text) return null;
    const tokenRegex = /(\[[A-Z0-9_]+_\d{3}\])/g;
    const parts = text.split(tokenRegex);

    return parts.map((part, idx) => {
      if (tokenRegex.test(part)) {
        // Extract entity type from token e.g. [CLIENT_NAME_001] -> CLIENT_NAME
        const entityName = part.replace(/^\[/, '').replace(/_\d{3}\]$/, '');
        return (
          <mark key={idx} className={`redaction-token token-${entityName.toLowerCase()}`}>
            {part}
          </mark>
        );
      }
      return part;
    });
  };

  return (
    <div className="redaction-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <h3>
            Local PII/PCI Redaction Pipeline
            <span className={`status-pill ${verification?.clean ? 'clean' : 'warning'}`}>
              {verification?.clean ? '✓ Verification Clean' : '⚠ Leaks Audited'}
            </span>
          </h3>
          <p className="panel-subtitle">
            Policy: <strong>{policy?.label || doctype}</strong> | Legal Rules: {pipeline?.legalRulesVersion || '1.0.0'} | Session ID: <span className="mono">{sessionId}</span>
          </p>
        </div>

        <div className="panel-tab-controls">
          <button
            className={activeTab === 'viewer' ? 'active' : ''}
            onClick={() => setActiveTab('viewer')}
          >
            Document Viewer
          </button>
          <button
            className={activeTab === 'stats' ? 'active' : ''}
            onClick={() => setActiveTab('stats')}
          >
            Token Stats ({stats?.totalTokens || 0})
          </button>
          <button
            className={activeTab === 'audit' ? 'active' : ''}
            onClick={() => setActiveTab('audit')}
          >
            Audit Trail ({pipeline?.audit?.length || 0})
          </button>
        </div>
      </div>

      {activeTab === 'viewer' && (
        <div className="tab-content viewer-tab">
          <div className="viewer-toolbar">
            <div className="view-toggle">
              <button
                className={`toggle-btn ${viewMode === 'redacted' ? 'selected' : ''}`}
                onClick={() => handleToggleView('redacted')}
              >
                🔒 Redacted (LLM Payload)
              </button>
              <button
                className={`toggle-btn ${viewMode === 'restored' ? 'selected' : ''}`}
                onClick={() => handleToggleView('restored')}
              >
                🔓 Unmasked (Session Vault)
              </button>
            </div>

            <button className="copy-btn" onClick={handleCopy}>
              {copied ? '✓ Copied!' : 'Copy Text'}
            </button>
          </div>

          <div className="document-text-container mono">
            {viewMode === 'restored' ? (
              loadingRestore ? (
                <div className="loading-state">Decrypting session vault token map...</div>
              ) : (
                <pre className="text-display">{restoredText || 'Click to load restored text'}</pre>
              )
            ) : (
              <pre className="text-display">{renderHighlightedText(redactedText)}</pre>
            )}
          </div>
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="tab-content stats-tab">
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-number">{stats?.totalTokens || 0}</span>
              <span className="stat-label">Total Redacted Tokens</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{stats?.detections?.selected || 0}</span>
              <span className="stat-label">Non-overlapping Entities</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{stats?.tokenizer?.tokenCount || 0}</span>
              <span className="stat-label">Total Document Words</span>
            </div>
          </div>

          <h4 style={{ marginTop: '1.5rem', marginBottom: '0.75rem' }}>Detections by Category</h4>
          <div className="entity-pills">
            {stats?.byEntity && Object.keys(stats.byEntity).length > 0 ? (
              Object.entries(stats.byEntity).map(([entity, count]) => (
                <div key={entity} className="entity-pill">
                  <span className="entity-name">{entity}</span>
                  <span className="entity-count">{count}</span>
                </div>
              ))
            ) : (
              <p style={{ color: 'var(--text-secondary)' }}>No entities masked under this policy.</p>
            )}
          </div>

          <h4 style={{ marginTop: '1.5rem', marginBottom: '0.75rem' }}>Detector Source Breakdown</h4>
          <div className="detector-bar">
            <span className="badge">NVIDIA GLiNER PII: {stats?.detections?.gliner || 0}</span>
            <span className="badge">Regex Engine: {stats?.detections?.regex || 0}</span>
            <span className="badge">Context Rules: {stats?.detections?.context || 0}</span>
            <span className="badge">SpaCy NER: {stats?.detections?.spacy || 0}</span>
            <span className="badge">HuggingFace NER: {stats?.detections?.hf || 0}</span>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="tab-content audit-tab">
          {pipeline?.audit && pipeline.audit.length > 0 ? (
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Entity Type</th>
                  <th>Action</th>
                  <th>Source</th>
                  <th>Assigned Token</th>
                  <th>Original Sample</th>
                </tr>
              </thead>
              <tbody>
                {pipeline.audit.map((item, idx) => (
                  <tr key={idx}>
                    <td><span className="mono">{item.entity}</span></td>
                    <td>
                      <span className={`action-tag action-${item.action}`}>
                        {item.action}
                      </span>
                    </td>
                    <td><span className="badge">{item.source}</span></td>
                    <td><span className="mono token-code">{item.token || '-'}</span></td>
                    <td><span className="mono sample-code">{item.sample}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--text-secondary)' }}>No audit log available for this run.</p>
          )}
        </div>
      )}
    </div>
  );
}
