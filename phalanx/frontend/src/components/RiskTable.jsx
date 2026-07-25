import { useMemo } from 'react';

export default function RiskTable({ findings = [] }) {
  const severityOrder = ['Critical', 'High', 'Medium', 'Low'];

  const grouped = useMemo(() => {
    return findings.reduce((acc, finding) => {
      if (!acc[finding.severity]) acc[finding.severity] = [];
      acc[finding.severity].push(finding);
      return acc;
    }, {});
  }, [findings]);

  return (
    <div className="risk-table">
      {severityOrder.map((severity) => {
        const items = grouped[severity];
        if (!items || items.length === 0) return null;

        return (
          <div key={severity} className="severity-group" style={{ marginBottom: '1.5rem' }}>
            <div className="severity-header">
              <span className={`badge ${severity.toLowerCase()}`}>{severity}</span>
              <span>{items.length} Finding{items.length !== 1 ? 's' : ''}</span>
            </div>

            <table className="findings-table">
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>Category</th>
                  <th style={{ width: '75%' }}>Issue & Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td>
                      <span className="mono">{item.category}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>{item.title}</div>
                      <div>{item.description}</div>

                      {item.clause && (
                        <div className="finding-clause mono">"{item.clause}"</div>
                      )}

                      {item.recommendation && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--medium-color)' }}>
                          <strong>Recommendation:</strong> {item.recommendation}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
