export default function PhaseStepper({ currentPhase, fileName }) {
  const phases = [
    { id: 0, name: 'Ingest', desc: 'Parsing document layout and text' },
    { id: 1, name: 'Redact', desc: 'Identifying and masking PII/sensitive data' },
    { id: 2, name: 'Graph', desc: 'Building entity and dependency graph' },
    { id: 3, name: 'Risk', desc: 'Applying rules engine for liability and exposure' },
    { id: 4, name: 'Benchmark', desc: 'Comparing against industry standards' },
  ];

  return (
    <div className="stepper-container">
      <h2 style={{ marginTop: 0, marginBottom: '2rem' }}>
        Processing <span className="mono" style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>{fileName}</span>
      </h2>

      <div className="phases">
        {phases.map((phase) => {
          let statusClass = 'pending';
          if (phase.id === currentPhase) statusClass = 'active';
          if (phase.id < currentPhase) statusClass = 'completed';

          return (
            <div key={phase.id} className={`step ${statusClass}`}>
              <div className="step-indicator">
                {statusClass === 'completed' ? '✓' : phase.id + 1}
              </div>
              <div className="step-content">
                <div className="step-title">{phase.name}</div>
                <div className="step-desc">{phase.desc}</div>
              </div>
              {statusClass === 'active' && (
                <div className="spinner" style={{ color: 'var(--medium-color)' }}>
                  Loading...
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
