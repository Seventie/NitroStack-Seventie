import { useState } from 'react';
import UploadZone from './components/UploadZone';
import PhaseStepper from './components/PhaseStepper';
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
    
    try {
      // Simulate phases for demo
      const phases = [0, 1, 2, 3, 4];
      for (const phase of phases) {
        setCurrentPhase(phase);
        await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5s per phase
      }
      
      const data = await analyzeDocument(uploadedFile, contractType);
      setResults(data);
      setState('RESULTS');
    } catch (error) {
      console.error('Analysis failed:', error);
      alert('Analysis failed. Please try again.');
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
            <div>
              <h2 style={{ marginTop: 0 }}>Analysis Results: <span className="mono">{file?.name}</span></h2>
              <p style={{ color: 'var(--text-secondary)' }}>
                Processed {results.metadata.pageCount} pages in {results.metadata.processingTime}
              </p>
            </div>
            
            <RiskTable findings={results.findings} />
            
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
