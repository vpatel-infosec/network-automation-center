import { diffLines } from 'diff';

function normalize(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/**
 * Produce an ordered list of rows for a side-by-side visual diff:
 *   { type: 'context' | 'added' | 'removed', line, oldLine?, newLine? }
 */
export function lineDiff(oldText = '', newText = '') {
  const parts = diffLines(normalize(oldText), normalize(newText));
  const rows = [];
  let oldLine = 1;
  let newLine = 1;

  for (const part of parts) {
    const lines = part.value.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    for (const line of lines) {
      if (part.added) {
        rows.push({ type: 'added', line, newLine: newLine++ });
      } else if (part.removed) {
        rows.push({ type: 'removed', line, oldLine: oldLine++ });
      } else {
        rows.push({ type: 'context', line, oldLine: oldLine++, newLine: newLine++ });
      }
    }
  }
  return rows;
}

export function diffSummary(rows) {
  return rows.reduce(
    (acc, row) => {
      if (row.type === 'added') acc.added += 1;
      else if (row.type === 'removed') acc.removed += 1;
      else acc.unchanged += 1;
      return acc;
    },
    { added: 0, removed: 0, unchanged: 0 }
  );
}

export function collapseContext(rows, context = 3) {
  const keep = new Array(rows.length).fill(false);
  rows.forEach((row, index) => {
    if (row.type === 'context') return;
    const from = Math.max(0, index - context);
    const to = Math.min(rows.length - 1, index + context);
    for (let i = from; i <= to; i += 1) keep[i] = true;
  });

  const out = [];
  let skipped = 0;
  rows.forEach((row, index) => {
    if (keep[index]) {
      if (skipped > 0) {
        out.push({ type: 'separator', line: `... ${skipped} unchanged line(s) ...` });
        skipped = 0;
      }
      out.push(row);
    } else {
      skipped += 1;
    }
  });
  if (skipped > 0) out.push({ type: 'separator', line: `... ${skipped} unchanged line(s) ...` });
  return out;
}

export default { lineDiff, diffSummary, collapseContext };
