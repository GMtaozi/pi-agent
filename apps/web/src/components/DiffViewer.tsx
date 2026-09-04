interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineNumber?: number;
}

interface DiffViewerProps {
  oldText: string;
  newText: string;
  oldLabel?: string;
  newLabel?: string;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const diff: DiffLine[] = [];

  // Simple line-by-line diff (could be enhanced with a proper diff algorithm)
  const maxLines = Math.max(oldLines.length, newLines.length);
  
  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === undefined) {
      diff.push({ type: 'added', content: newLine, lineNumber: i + 1 });
    } else if (newLine === undefined) {
      diff.push({ type: 'removed', content: oldLine, lineNumber: i + 1 });
    } else if (oldLine === newLine) {
      diff.push({ type: 'unchanged', content: oldLine, lineNumber: i + 1 });
    } else {
      diff.push({ type: 'removed', content: oldLine, lineNumber: i + 1 });
      diff.push({ type: 'added', content: newLine, lineNumber: i + 1 });
    }
  }

  return diff;
}

export default function DiffViewer({ oldText, newText, oldLabel = 'Previous', newLabel = 'Current' }: DiffViewerProps) {
  const diff = computeDiff(oldText, newText);

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', background: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
        <div style={{ flex: 1, padding: '8px 16px', fontSize: 12, fontWeight: 500, borderRight: '1px solid #ddd' }}>
          {oldLabel}
        </div>
        <div style={{ flex: 1, padding: '8px 16px', fontSize: 12, fontWeight: 500 }}>
          {newLabel}
        </div>
      </div>
      <div style={{ maxHeight: 500, overflowY: 'auto', fontFamily: 'monospace', fontSize: 13 }}>
        {diff.map((line, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              background: line.type === 'added' ? '#dcfce7' : line.type === 'removed' ? '#fee2e2' : 'transparent'
            }}
          >
            <div style={{
              width: 40,
              padding: '4px 8px',
              textAlign: 'right',
              color: '#999',
              borderRight: '1px solid #eee',
              userSelect: 'none'
            }}>
              {line.lineNumber || ''}
            </div>
            <div style={{
              width: 40,
              padding: '4px 8px',
              textAlign: 'center',
              color: line.type === 'added' ? '#16a34a' : line.type === 'removed' ? '#dc2626' : '#999',
              borderRight: '1px solid #eee',
              userSelect: 'none'
            }}>
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </div>
            <div style={{ flex: 1, padding: '4px 8px', whiteSpace: 'pre-wrap' }}>
              {line.content || ' '}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
