import { useState } from 'react';
import UploadZone from './components/UploadZone';
import PhaseStepper from './components/PhaseStepper';
import RedactionPanel from './components/RedactionPanel';
import RiskTable from './components/RiskTable';
import { analyzeDocument } from './lib/mcp-client';

function App() {
  const [state, setState] = useState('UPLOAD'); // UPLOAD, PROCESSING, RESULTS
  const [file, setFile] = useState(null);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [results, setResults] = useState(null);

  const handleUpload = async (uploadedFile, contractType) => {
    setFile(uploadedFile);
    setState('PROCESSING');
    setCurrentPhase(0);
    
    try {
      const data = await analyzeDocument(uploadedFile, contractType, (phaseIndex) => {
        setCurrentPhase(phaseIndex);
      });
      setResults(data);
      setState('RESULTS');
    } catch (error) {
      console.error('Analysis failed:', error);
      alert(`Analysis failed: ${error.message || error}`);
      setState('UPLOAD');
    }
  };

  const reset = () => {
    setFile(null);
    setResults(null);
    setCurrentPhase(0);
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
            <div className="results-header">
              <h2 style={{ marginTop: 0 }}>
                Analysis Results: <span className="mono">{file?.name}</span>
              </h2>
              <p style={{ color: 'var(--text-secondary)' }}>
                Processed {results.metadata.pageCount} page(s) | Status: Complete
              </p>
            </div>
            
            {results.redaction && (
              <RedactionPanel redactionData={results.redaction} fileName={file?.name} />
            )}

            <div className="findings-section">
              <h3 style={{ marginBottom: '1rem' }}>Contract Risk Analysis</h3>
              <RiskTable findings={results.findings} />
            </div>
            
            <div className="action-buttons">
              <button className="primary" onClick={() => window.print()}>Export Report</button>
              <button onClick={reset}>Analyze Another Document</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
