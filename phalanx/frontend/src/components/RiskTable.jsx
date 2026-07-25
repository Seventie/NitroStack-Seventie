import { useState, useMemo } from 'react';

function FindingCard({ item }) {
  const [expanded, setExpanded] = useState(false);
  const severityColors = {
    Critical: '#ef4444',
    High: '#f97316',
    Medium: '#eab308',
    Low: '#3b82f6'
  };

  return (
    <div 
      onClick={() => setExpanded(!expanded)}
      style={{
        border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
        borderRadius: '8px',
        padding: '1.25rem',
        marginBottom: '1rem',
        background: expanded ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
        cursor: 'pointer',
        transition: 'all 0.2s ease'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span 
            className={`badge ${item.severity?.toLowerCase() || 'low'}`}
            style={{ 
              backgroundColor: severityColors[item.severity] || '#6b7280',
              color: '#fff',
              padding: '0.25rem 0.6rem',
              borderRadius: '4px',
              fontWeight: 'bold',
              fontSize: '0.75rem'
            }}
          >
            {item.severity || 'Notice'}
          </span>
          {item.page && (
            <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
              📄 Page {item.page}
            </span>
          )}
          <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontFamily: 'monospace' }}>
            {item.category || 'General'}
          </span>
          {item.clauseTitle && (
            <span style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              {item.clauseTitle}
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.75rem', color: item.confidence > 0.8 ? '#10b981' : '#f59e0b', fontWeight: 'bold' }}>
          Confidence: {Math.round((item.confidence || 0.85) * 100)}% {expanded ? '▲' : '▼'}
        </div>
      </div>

      <div style={{ fontWeight: 'bold', fontSize: '1.05rem', marginBottom: '0.5rem' }}>
        {item.title || item.issue}
      </div>

      <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #cbd5e1)', marginBottom: expanded ? '1rem' : '0' }}>
        {item.businessImpact || item.description}
      </div>

      {expanded && (
        <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
          {item.legalReason && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                ⚖️ Legal Analysis & Reason
              </div>
              <div style={{ fontSize: '0.9rem', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '4px' }}>
                {item.legalReason}
              </div>
            </div>
          )}

          {item.clause && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                🔍 Quoted Sentence / Source Clause
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#e2e8f0', background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '4px', borderLeft: '3px solid #64748b', fontStyle: 'italic' }}>
                "{item.clause}"
              </div>
            </div>
          )}

          {item.recommendation && (
            <div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#10b981', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                💡 Actionable Negotiation Advice
              </div>
              <div style={{ fontSize: '0.9rem', background: 'rgba(16, 185, 129, 0.1)', padding: '0.75rem', borderRadius: '4px', borderLeft: '3px solid #10b981', color: '#ecfdf5' }}>
                {item.recommendation}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RiskTable({ findings = [] }) {
  const severityOrder = ['Critical', 'High', 'Medium', 'Low'];

  const grouped = useMemo(() => {
    return findings.reduce((acc, finding) => {
      const sev = finding.severity || 'Medium';
      if (!acc[sev]) acc[sev] = [];
      acc[sev].push(finding);
      return acc;
    }, {});
  }, [findings]);

  if (!findings || findings.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No high-risk weaknesses identified in analyzed clauses.</div>;
  return (
    <div className="risk-table">
      {severityOrder.map((severity) => {
        const items = grouped[severity];
        if (!items || items.length === 0) return null;

        return (
          <div key={severity} className="severity-group" style={{ marginBottom: '2rem' }}>
            <div className="severity-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{severity} Severity Findings</span>
              <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.5rem', borderRadius: '12px', fontSize: '0.8rem' }}>{items.length}</span>
            </div>
            {items.map((item, idx) => (
              <FindingCard key={idx} item={item} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
}