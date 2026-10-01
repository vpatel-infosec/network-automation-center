export default function DiffViewer({ rows = [], summary = null }) {
  return (
    <div className="diff-wrap">
      {summary ? (
        <div className="diff-summary">
          <span className="badge badge-ok">+{summary.added} added</span>
          <span className="badge badge-bad">-{summary.removed} removed</span>
          <span className="muted small">{summary.unchanged} unchanged</span>
        </div>
      ) : null}
      <div className="diff-body">
        {rows.map((row, index) => (
          <div key={`${index}-${row.line}`} className={`diff-row diff-${row.type}`}>
            <span className="diff-no">{row.oldLine ?? ''}</span>
            <span className="diff-no">{row.newLine ?? ''}</span>
            <code className="diff-line">
              {row.type === 'added' ? '+ ' : row.type === 'removed' ? '- ' : '  '}
              {row.line || ' '}
            </code>
          </div>
        ))}
        {!rows.length ? <p className="muted small pad">No differences.</p> : null}
      </div>
    </div>
  );
}
