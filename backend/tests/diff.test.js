import test from 'node:test';
import assert from 'node:assert/strict';
import { lineDiff, diffSummary, collapseContext } from '../src/utils/diff.js';

test('lineDiff marks added, removed and context rows with line numbers', () => {
  const oldText = ['hostname SW1', 'vlan 10', ' name DATA', 'end'].join('\n');
  const newText = ['hostname SW1', 'vlan 10', ' name DATA', 'vlan 20', ' name VOICE', 'end'].join('\n');

  const rows = lineDiff(oldText, newText);
  assert.deepEqual(diffSummary(rows), { added: 2, removed: 0, unchanged: 4 });
  assert.equal(rows[0].type, 'context');
  assert.equal(rows[0].oldLine, 1);
  assert.equal(rows[0].newLine, 1);

  const added = rows.filter((row) => row.type === 'added');
  assert.deepEqual(added.map((row) => row.line), ['vlan 20', ' name VOICE']);
});

test('lineDiff detects removed lines', () => {
  const rows = lineDiff('a\nb\nc', 'a\nc');
  assert.deepEqual(diffSummary(rows), { added: 0, removed: 1, unchanged: 2 });
  assert.equal(rows.find((row) => row.type === 'removed').line, 'b');
});

test('lineDiff normalizes CRLF and CR line endings', () => {
  const rows = lineDiff('a\r\nb\r\n', 'a\nb\n');
  assert.deepEqual(diffSummary(rows), { added: 0, removed: 0, unchanged: 2 });
});

test('collapseContext keeps changes plus N context lines and adds separators', () => {
  const oldLines = Array.from({ length: 40 }, (_, index) => `line-${index}`);
  const newLines = [...oldLines];
  newLines[20] = 'line-20-changed';

  const rows = lineDiff(oldLines.join('\n'), newLines.join('\n'));
  const collapsed = collapseContext(rows, 2);

  assert.ok(collapsed.length < rows.length);
  assert.ok(collapsed.some((row) => row.type === 'separator'));
  assert.ok(collapsed.some((row) => row.line === 'line-20-changed' && row.type === 'added'));
  assert.ok(collapsed.some((row) => row.line === 'line-18'));
  assert.ok(!collapsed.some((row) => row.line === 'line-5'));

  const collapsedSummary = diffSummary(rows);
  assert.equal(collapsedSummary.added, 1);
  assert.equal(collapsedSummary.removed, 1);
});
