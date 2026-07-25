import { useState } from 'react';
import UploadZone from './components/UploadZone';
import PhaseStepper from './components/PhaseStepper';
import RiskTable from './components/RiskTable';
import KnowledgeGraphView from './components/KnowledgeGraphView';
import { analyzeDocument } from './lib/mcp-client';

function App() {
  const [state, setState] = useState('UPLOAD');
  const [file, setFile] = useState(null);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  const handleUpload = async (uploadedFile, contractType) => {
    setFile(uploadedFile);
    setError('');
    setState('PROCESSING');

    try {
      const phases = [0, 1, 2, 3, 4];
      for (const phase of phases) {
        setCurrentPhase(phase);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const data = await analyzeDocument(uploadedFile, contractType);
      setResults(data);
      setState('RESULTS');
    } catch (error) {
      console.error('Analysis failed:', error);
      setError('Analysis could not be completed. Please try again.');
      setState('UPLOAD');
    }
  };

  const reset = () => {
    setFile(null);
    setResults(null);
    setCurrentPhase(0);
    setError('');
    setState('UPLOAD');
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark">P</div>
          <div>
            <p className="eyebrow">Contract review workspace</p>
            <h1>Phalanx <span className="brand-slash">/</span> Risk</h1>
          </div>
        </div>
        <div className="header-pill">Upload • Review • Negotiate</div>
      </header>

      <main className="app-main">
        {state === 'UPLOAD' && (
          <div className="hero-grid">
            <section className="hero-card">
              <p className="eyebrow">Human-led deal review</p>
              <h2>Turn a dense contract into a decision-ready negotiation brief.</h2>
              <p>
                Upload an agreement, review the clauses flagged by the pipeline, and export a concise redline and negotiation email for sign-off.
              </p>
              <div className="hero-points">
                <div className="point-chip">Redaction and placeholder restoration</div>
                <div className="point-chip">Clause graph and dependency view</div>
                <div className="point-chip">Risk findings with redlines and email draft</div>
              </div>
            </section>

            <section className="upload-panel">
              <UploadZone onUpload={handleUpload} />
              {error && <div className="upload-error">{error}</div>}
            </section>
          </div>
        )}

        {state === 'PROCESSING' && (
          <section className="processing-panel">
            <div className="panel-intro">
              <p className="eyebrow">Working through the document</p>
              <h2>Reviewing the agreement and preparing the final brief.</h2>
            </div>
            <PhaseStepper currentPhase={currentPhase} fileName={file?.name} />
          </section>
        )}

        {state === 'RESULTS' && results && (
          <div className="results-shell">
            <section className="results-intro">
              <div>
                <p className="eyebrow">Review complete</p>
                <h2>{file?.name}</h2>
                <p>
                  Processed {results.metadata.pageCount} pages in {results.metadata.processingTime}. The report below combines the redaction outcome, graph context, risk findings, redlines, and a draft negotiation email.
                </p>
              </div>
              <div className="action-buttons">
                <button className="primary" onClick={() => window.print()}>Export report</button>
                <button onClick={reset}>Start over</button>
              </div>
            </section>

            <section className="summary-grid" style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
              <article className="panel-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="panel-title" style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: 'var(--text-primary)' }}>📊 Overall Risk Gauge & Breakdown</div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem' }}>
                  <div style={{
                    width: '90px', height: '90px', borderRadius: '50%',
                    border: `6px solid ${results.metadata.riskScore > 60 ? '#ef4444' : results.metadata.riskScore > 30 ? '#f97316' : '#10b981'}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.6rem', fontWeight: 'bold', backgroundColor: 'rgba(0,0,0,0.2)'
                  }}>
                    {results.metadata.riskScore}
                    <span style={{ fontSize: '0.65rem', fontWeight: 'normal', color: '#94a3b8' }}>/ 100</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#f8fafc' }}>
                      {results.metadata.riskScore > 60 ? 'Critical Risk Exposure' : results.metadata.riskScore > 30 ? 'Moderate Commercial Risk' : 'Low / Favorable Risk'}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                      Explainable scoring calculated across all analyzed clauses and positive mitigating protections.
                    </div>
                  </div>
                </div>

                {results.scoreBreakdown && Object.keys(results.scoreBreakdown).length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.5rem' }}>Risk Score Breakdown</div>
                    {Object.entries(results.scoreBreakdown).map(([domain, val]) => (
                      <div key={domain} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', fontSize: '0.9rem' }}>
                        <span>{domain}</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: val > 0 ? '#ef4444' : '#10b981' }}>
                          {val >= 0 ? `+${val}` : val}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="panel-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="panel-title" style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem' }}>📈 Risk Distribution Chart</div>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1rem' }}>Distribution of identified clause risks by severity level.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  {['Critical', 'High', 'Medium', 'Low'].map(sev => {
                    const count = results.findings?.filter(f => f.severity === sev || (!f.severity && sev === 'Medium')).length || 0;
                    const colors = { Critical: '#ef4444', High: '#f97316', Medium: '#eab308', Low: '#3b82f6' };
                    return (
                      <div key={sev} style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', borderLeft: `4px solid ${colors[sev]}` }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors[sev] }}>{count}</div>
                        <div style={{ fontSize: '0.8rem', color: '#cbd5e1', textTransform: 'uppercase', fontWeight: '600' }}>{sev}</div>
                      </div>
                    );
                  })}
                </div>
              </article>
            </section>

            {results.strengths && results.strengths.length > 0 && (
              <section className="panel-card" style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)', marginBottom: '2rem' }}>
                <div className="panel-title" style={{ color: '#10b981', fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>🛡️ Strengths & Positive Findings</div>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1rem' }}>Key commercial and legal protections successfully identified in this contract:</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                  {results.strengths.map((strength, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', color: '#ecfdf5', background: 'rgba(0,0,0,0.2)', padding: '0.6rem 1rem', borderRadius: '6px' }}>
                      <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span> {strength}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="panel-card" style={{ marginBottom: '2rem' }}>
              <div className="panel-title" style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>⚠️ Weaknesses & Clause Navigator</div>
              <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1.5rem' }}>Click any clause card below to expand full legal reasoning, exact quoted text, and actionable negotiation advice.</p>
              <RiskTable findings={results.findings} />
            </section>

            <section className="panel-card" style={{ marginBottom: '2rem' }}>
              <div className="panel-title" style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>✏️ Suggested Redlines</div>
              <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1.5rem' }}>Professional revisions tailored for commercially balanced risk allocation and quick counterparty approval.</p>
              <div className="stack-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {results.redlines?.map((redline, index) => (
                  <div key={index} className="stack-item" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '1rem', color: '#f8fafc' }}>Revision #{index + 1}</span>
                      <span style={{ 
                        padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold',
                        background: redline.priority === 'High' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                        color: redline.priority === 'High' ? '#ef4444' : '#60a5fa'
                      }}>
                        Priority: {redline.priority || 'Medium'}
                      </span>
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#ef4444', fontWeight: '600', marginBottom: '0.25rem' }}>Original Clause</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.05)', padding: '0.75rem', borderRadius: '4px', color: '#fca5a5', textDecoration: 'line-through' }}>
                        {redline.original}
                      </div>
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#10b981', fontWeight: '600', marginBottom: '0.25rem' }}>Suggested Revision</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', background: 'rgba(16, 185, 129, 0.1)', padding: '0.75rem', borderRadius: '4px', color: '#ecfdf5', borderLeft: '3px solid #10b981' }}>
                        {redline.proposed}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '6px' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '600', marginBottom: '0.25rem' }}>Reason & Business Rationale</div>
                        <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{redline.reason || redline.rationale}</div>
                      </div>
                      {redline.negotiationPosition && (
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#f59e0b', textTransform: 'uppercase', fontWeight: '600', marginBottom: '0.25rem' }}>🤝 Negotiation & Fallback Position</div>
                          <div style={{ fontSize: '0.85rem', color: '#fef3c7' }}>{redline.negotiationPosition}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel-card" style={{ marginBottom: '3rem' }}>
              <div className="panel-title" style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>📧 Prioritized Negotiation Email Preview</div>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1rem' }}>Drafted for commercial counterparties to accelerate signing without legal friction.</p>
              <div className="email-box" style={{ fontFamily: 'sans-serif', whiteSpace: 'pre-line', fontSize: '0.95rem', lineHeight: '1.6', background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc' }}>
                {results.email}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
