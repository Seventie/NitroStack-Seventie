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

            <section className="summary-grid">
              <article className="panel-card">
                <div className="panel-title">Redaction summary</div>
                <p className="panel-copy">The contract was processed using the selected policy and restored placeholders for the final briefing.</p>
                <div className="detail-box">
                  <strong>Document</strong>
                  <span>{file?.name}</span>
                </div>
                <div className="detail-box">
                  <strong>Risk score</strong>
                  <span>{results.metadata.riskScore}</span>
                </div>
                <div className="detail-box">
                  <strong>Source</strong>
                  <span>{results.metadata.source}</span>
                </div>
              </article>

              <article className="panel-card">
                <div className="panel-title">Knowledge graph</div>
                <KnowledgeGraphView graph={results.graph} />
              </article>
            </section>

            <section className="panel-card">
              <div className="panel-title">Risk findings</div>
              <RiskTable findings={results.findings} />
            </section>

            <section className="panel-card">
              <div className="panel-title">Redlines</div>
              <div className="stack-list">
                {results.redlines?.map((redline, index) => (
                  <div key={index} className="stack-item">
                    <div className="stack-item-title">{redline.original}</div>
                    <div className="stack-item-copy">{redline.proposed}</div>
                    <div className="stack-item-meta">{redline.rationale}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel-card">
              <div className="panel-title">Negotiation email</div>
              <div className="email-box">{results.email}</div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
