import { useState } from 'react';
import UploadZone from './components/UploadZone';
import PhaseStepper from './components/PhaseStepper';
import RiskDashboard from './components/RiskTable';
import { analyzeDocument } from './lib/mcp-client';

function RedlineCard({ redline }) {
  return (
    <div style={{
      textAlign: 'left', background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--border-color)', borderRadius: 8,
      marginBottom: '1rem', overflow: 'hidden'
    }}>
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          📝 Proposed Redline (Finding {redline.findingId})
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          {redline.rationale}
        </div>
      </div>
      <div style={{ padding: '1rem', display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--medium-color)', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            New Clause Text
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: '0.875rem', color: '#e2e8f0',
            background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 6,
            borderLeft: '2px solid var(--medium-color)'
          }}>
            {redline.proposedText}
          </div>
        </div>
      </div>
      {redline.fallbackPosition && (
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-color)', fontSize: '0.875rem', background: 'rgba(245, 158, 11, 0.05)' }}>
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>Fallback: </span>
          {redline.fallbackPosition}
        </div>
      )}
    </div>
  );
}

function App() {
  const [state, setState] = useState('UPLOAD'); // UPLOAD | PROCESSING | RESULTS
  const [file, setFile] = useState(null);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('risk'); // risk | redlines

  const handleUpload = async (uploadedFile, contractType) => {
    setFile(uploadedFile);
    setState('PROCESSING');

    try {
      const phases = [0, 1, 2, 3, 4];
      for (const phase of phases) {
        setCurrentPhase(phase);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      const data = await analyzeDocument(uploadedFile, contractType);
      setResults(data);
      setActiveTab('risk');
      setState('RESULTS');
    } catch (error) {
      console.error('Analysis failed:', error);
      alert('Analysis failed: ' + error.message);
      setState('UPLOAD');
    }
  };

  const reset = () => {
    setFile(null);
    setResults(null);
    setCurrentPhase(0);
    setActiveTab('risk');
    setState('UPLOAD');
  };

  return (
    <div className="app-container">
      <header>
        <h1>Phalanx<span style={{ color: 'var(--medium-color)' }}>//</span>Risk</h1>
      </header>

      <main>
        {state === 'UPLOAD' && (
          <UploadZone onUpload={handleUpload} />
        )}

        {state === 'PROCESSING' && (
          <PhaseStepper currentPhase={currentPhase} fileName={file?.name} />
        )}

        {state === 'RESULTS' && results && (
          <div className="results-container">
            {/* ── File header ───────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                  <span className="mono" style={{ color: 'var(--text-secondary)' }}>{file?.name}</span>
                </h2>
                <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
                  {results.metadata?.pageCount ?? '?'} page(s) · {results.metadata?.processingTime ?? 'Done'}
                </p>
              </div>
              <button onClick={reset} style={{ fontSize: '0.8rem', padding: '0.4rem 0.9rem' }}>
                ↩ New Document
              </button>
            </div>

            {/* ── Tab bar: Part 3 vs Part 4 ─────────────── */}
            <div style={{
              display: 'flex', gap: '0', borderBottom: '1px solid var(--border-color)',
              marginTop: '0.5rem'
            }}>
              {[
                { id: 'risk',     label: '🚨 Part 3 — Risk Analysis',  desc: 'What\'s wrong & why' },
                { id: 'redlines', label: '✏️  Part 4 — Redlines',       desc: 'Proposed clause rewrites' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === tab.id
                      ? '2px solid var(--medium-color)'
                      : '2px solid transparent',
                    borderRadius: 0,
                    color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    padding: '0.6rem 1.25rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: activeTab === tab.id ? 600 : 400,
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.1rem',
                  }}
                >
                  <span>{tab.label}</span>
                  <span style={{ fontSize: '0.72rem', opacity: 0.6 }}>{tab.desc}</span>
                </button>
              ))}
            </div>

            {/* ── Part 3: Risk Dashboard ────────────────── */}
            {activeTab === 'risk' && (
              <RiskDashboard data={results} />
            )}

            {/* ── Part 4: Redlines (placeholder) ───────── */}
            {activeTab === 'redlines' && (
              <div style={{
                textAlign: 'center', padding: '4rem 2rem',
                color: 'var(--text-secondary)',
                border: '1px dashed var(--border-color)',
                borderRadius: 12, marginTop: '1rem'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✏️</div>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                  Part 4 — Clause Redlines
                </div>
                <div style={{ maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
                  Proposed rewrites for flagged clauses will appear here — showing the original
                  redacted text alongside the AI-suggested replacement, side by side.
                </div>
                {results.redlines && results.redlines.length > 0 && (
                  <div style={{ marginTop: '1.5rem' }}>
                    {results.redlines.map((r, i) => (
                      <RedlineCard key={i} redline={r} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Export button ────────────────────────── */}
            <div className="action-buttons">
              <button className="primary" onClick={() => window.print()}>Export Report</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
