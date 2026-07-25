export default function KnowledgeGraphView({ graph }) {
  if (!graph) return null;

  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  return (
    <div className="graph-view">
      <div className="graph-metrics">
        <div>
          <span className="metric-label">Graph ID</span>
          <span className="metric-value mono">{graph.graphId}</span>
        </div>
        <div>
          <span className="metric-label">Nodes</span>
          <span className="metric-value">{graph.nodeCount || nodes.length}</span>
        </div>
        <div>
          <span className="metric-label">Edges</span>
          <span className="metric-value">{graph.edgeCount || edges.length}</span>
        </div>
      </div>

      <div className="graph-list">
        {nodes.map((node, index) => (
          <div key={node.key || index} className="graph-node-card">
            <div className="graph-node-title">{node.attributes?.label || node.key}</div>
            <div className="graph-node-meta">{node.attributes?.category || node.attributes?.type || 'Clause'}</div>
            <div className="graph-node-text">{node.attributes?.text || 'Connected clause entity'}</div>
          </div>
        ))}
      </div>

      <div className="graph-edges-list">
        {edges.map((edge, index) => (
          <div key={`${edge.source}-${edge.target}-${index}`} className="graph-edge-card">
            <span className="mono">{edge.source}</span>
            <span className="edge-arrow">→</span>
            <span className="mono">{edge.target}</span>
            <span className="edge-type">{edge.attributes?.type || 'references'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
