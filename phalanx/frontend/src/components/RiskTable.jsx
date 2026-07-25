import { useState } from 'react';

const SEVERITY_ICONS = { Critical: '🔴', High: '🟠', Medium: '🟡', Low: '🟢' };
const SEVERITY_ORDER = ['Critical', 'High', 'Medium', 'Low'];

const AGENT_META = {
  corporate:  { label: '🏢 Corporate',  color: '#8b5cf6' },
  financial:  { label: '💰 Financial',  color: '#f59e0b' },
  liability:  { label: '⚖️ Liability',  color: '#ef4444' },
  privacy:    { label: '🔒 Privacy',    color: '#3b82f6' },
};

function ScoreBar({ score, color }) {
  const pct = Math.min(100, Math.max(0, score ?? 0));
  const risk = pct >= 75 ? '#ef4444' : pct >= 40 ? '#f59e0b' : '#22c55e';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{
        flex: 1, height: 6, background: 'rgba(255,255,255,0.08)',
        borderRadius: 99, overflow: 'hidden'
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: risk, borderRadius: 99,
          transition: 'width 0.6s ease'
        }} />
      </div>
      <span style={{ fontSize: '0.75rem', color: risk, fontWeight: 700, minWidth: 32 }}>{pct}</span>
    </div>
  );
}

function FindingCard({ finding }) {
  const [open, setOpen] = useState(false);
  const sev = finding.severity;
  const colors = { Critical: '#ef4444', High: '#f59e0b', Medium: '#3b82f6', Low: '#22c55e' };
  const border = colors[sev] ?? '#94a3b8';

  return (
    <div style={{
      borderLeft: `3px solid ${border}`,
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '0 8px 8px 0',
      marginBottom: '0.75rem',
      overflow: 'hidden'
    }}>
      {/* Header row */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
          padding: '1rem 1rem 0.75rem', cursor: 'pointer'
        }}
      >
        <span style={{ fontSize: '1.1rem', marginTop: 2 }}>{SEVERITY_ICONS[sev] ?? '⚪'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{finding.title}</div>

          {/* Clause quote — THIS is what shows the user WHICH clause */}
          {finding.clause && (
            <div style={{
              fontFamily: 'monospace', fontSize: '0.78rem',
              color: '#94a3b8', background: 'rgba(0,0,0,0.3)',
              borderLeft: '2px solid rgba(255,255,255,0.15)',
              padding: '0.4rem 0.6rem', borderRadius: '0 4px 4px 0',
              margin: '0.4rem 0', maxHeight: 60, overflow: 'hidden'
            }}>
              {finding.clauseId && (
                <span style={{ color: border, marginRight: '0.4rem', fontWeight: 700 }}>
                  [{finding.clauseId}]
                </span>
              )}
              "{finding.clause.slice(0, 160)}{finding.clause.length > 160 ? '…' : ''}"
            </div>
          )}

          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            {finding.description?.slice(0, 120)}{finding.description?.length > 120 ? '…' : ''}
          </div>
        </div>
        <span style={{ color: '#475569', fontSize: '0.8rem', marginTop: 2, flexShrink: 0 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{ padding: '0 1rem 1rem 3rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ paddingTop: '0.75rem', fontSize: '0.875rem', color: '#cbd5e1', lineHeight: 1.6 }}>
            {finding.description}
          </div>

          {finding.clause && (
            <div style={{
              margin: '0.75rem 0', fontFamily: 'monospace', fontSize: '0.8rem',
              color: '#94a3b8', background: 'rgba(0,0,0,0.4)',
              padding: '0.6rem 0.8rem', borderRadius: 6,
              borderLeft: `2px solid ${border}`
            }}>
              <div style={{ color: border, fontWeight: 700, marginBottom: '0.25rem' }}>
                Problematic clause {finding.clauseId ? `(${finding.clauseId})` : ''}:
              </div>
              {finding.clause}
            </div>
          )}

          {finding.recommendation && (
            <div style={{
              marginTop: '0.75rem', padding: '0.6rem 0.8rem',
              background: 'rgba(34, 197, 94, 0.07)',
              border: '1px solid rgba(34, 197, 94, 0.2)',
              borderRadius: 6, fontSize: '0.875rem'
            }}>
              <span style={{ color: '#22c55e', fontWeight: 700 }}>💡 Recommendation: </span>
              {finding.recommendation}
            </div>
          )}

          {finding.benchmarkNote && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
              📊 {finding.benchmarkNote}
            </div>
          )}

          {finding.confidence != null && (
            <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: '#475569' }}>
              Confidence: {Math.round(finding.confidence * 100)}%
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RiskDashboard({ data }) {
  const [activeAgent, setActiveAgent] = useState('all');

  // Support both old `findings` array and new `{ reports, findings, totalScore }` shape
  const totalScore = data.totalScore ?? data.score ?? 0;
  const allFindings = data.findings ?? [];
  const reports = data.reports ?? [];

  const displayed = activeAgent === 'all'
    ? [...allFindings].sort((a, b) => {
        const o = { Critical: 0, High: 1, Medium: 2, Low: 3 };
        return (o[a.severity] ?? 9) - (o[b.severity] ?? 9);
      })
    : [...allFindings]
        .filter(f => f.agent === activeAgent)
        .sort((a, b) => {
          const o = { Critical: 0, High: 1, Medium: 2, Low: 3 };
          return (o[a.severity] ?? 9) - (o[b.severity] ?? 9);
        });

  const scoreColor = totalScore >= 75 ? '#ef4444' : totalScore >= 40 ? '#f59e0b' : '#22c55e';
  const scoreLabel = totalScore >= 75 ? 'HIGH RISK' : totalScore >= 40 ? 'MEDIUM RISK' : 'LOW RISK';

  return (
    <div>
      {/* ── Overall score banner ─────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '2rem',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${scoreColor}44`,
        borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1.5rem'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
            {totalScore}
          </div>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.1em', color: scoreColor, marginTop: 2 }}>
            {scoreLabel}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Overall Risk Score</div>
          <ScoreBar score={totalScore} />
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.4rem' }}>
            {allFindings.length} findings across {Object.keys(AGENT_META).length} risk categories
          </div>
        </div>
      </div>

      {/* ── Per-agent score strip ────────────────────────────── */}
      {reports.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '0.75rem', marginBottom: '1.5rem'
        }}>
          {reports.map(r => {
            const meta = AGENT_META[r.agent] ?? { label: r.agent, color: '#94a3b8' };
            return (
              <div
                key={r.agent}
                onClick={() => setActiveAgent(r.agent)}
                style={{
                  background: activeAgent === r.agent
                    ? `${meta.color}22` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${activeAgent === r.agent ? meta.color : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 8, padding: '0.75rem', cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                  {meta.label}
                </div>
                <ScoreBar score={r.score} color={meta.color} />
                <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '0.25rem' }}>
                  {r.findings?.length ?? 0} findings
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Agent filter tabs ────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[['all', '🗂 All findings'], ...Object.entries(AGENT_META).map(([k, v]) => [k, v.label])].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveAgent(key)}
            style={{
              padding: '0.35rem 0.8rem', borderRadius: 99, fontSize: '0.8rem',
              background: activeAgent === key ? (AGENT_META[key]?.color ?? '#3b82f6') : 'rgba(255,255,255,0.05)',
              border: 'none', color: activeAgent === key ? '#fff' : '#94a3b8',
              cursor: 'pointer', fontWeight: activeAgent === key ? 600 : 400,
              transition: 'all 0.15s'
            }}
          >
            {label}
            <span style={{ marginLeft: '0.3rem', opacity: 0.7 }}>
              ({key === 'all' ? allFindings.length : allFindings.filter(f => f.agent === key).length})
            </span>
          </button>
        ))}
      </div>

      {/* ── Finding cards ────────────────────────────────────── */}
      <div>
        {SEVERITY_ORDER.map(sev => {
          const group = displayed.filter(f => f.severity === sev);
          if (!group.length) return null;
          return (
            <div key={sev} style={{ marginBottom: '1rem' }}>
              <div style={{
                fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em',
                color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem',
                display: 'flex', alignItems: 'center', gap: '0.5rem'
              }}>
                {SEVERITY_ICONS[sev]} {sev} — {group.length} finding{group.length > 1 ? 's' : ''}
              </div>
              {group.map((f, i) => <FindingCard key={i} finding={f} />)}
            </div>
          );
        })}
        {displayed.length === 0 && (
          <div style={{ textAlign: 'center', color: '#475569', padding: '2rem' }}>
            No findings for this agent.
          </div>
        )}
      </div>
    </div>
  );
}
