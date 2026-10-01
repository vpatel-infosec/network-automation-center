import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toLines,
  resolveCommands,
  resolvePrompt,
  filterRestoreLines,
  summarizeConfigErrors,
  normalizeForHash,
  truncate,
} from '../src/drivers/base.js';
import ciscoIos from '../src/drivers/ciscoIos.js';

test('toLines splits strings, flattens arrays and drops blank lines', () => {
  assert.deepEqual(toLines('a\n\nb\r\nc'), ['a', 'b', 'c']);
  assert.deepEqual(toLines(['a', 'b\nc']), ['a', 'b', 'c']);
  assert.deepEqual(toLines(undefined), []);
});

test('resolveCommands prefers device overrides over driver defaults', () => {
  const device = { commandOverrides: { backup: 'show config\nshow vlan' } };
  assert.deepEqual(resolveCommands(device, ciscoIos, 'backup'), ['show config', 'show vlan']);
  assert.deepEqual(resolveCommands({ commandOverrides: {} }, ciscoIos, 'backup'), ['show running-config']);
  assert.deepEqual(resolveCommands({}, ciscoIos, 'save'), ['write memory']);
});

test('resolvePrompt builds a RegExp from device overrides and rejects bad patterns', () => {
  const driver = { prompt: /[>#]\s*$/ };
  assert.equal(resolvePrompt({}, driver).source, '[>#]\\s*$');
  assert.ok(resolvePrompt({ commandOverrides: { prompt: '\\$\\s*$' } }, driver) instanceof RegExp);
  assert.throws(() => resolvePrompt({ commandOverrides: { prompt: '[' } }, driver), /Invalid prompt/);
});

test('filterRestoreLines strips headers, comments and mode-changing lines', () => {
  const config = [
    'Building configuration...',
    '',
    'Current configuration : 3980 bytes',
    '!',
    '! Last configuration change at 10:00:00 UTC Mon Jan 1 2026',
    'version 15.2',
    'hostname SW1',
    'end',
    'exit',
  ].join('\n');

  assert.deepEqual(filterRestoreLines(config), ['version 15.2', 'hostname SW1']);
});

test('summarizeConfigErrors detects vendor error lines', () => {
  const output = [
    'SW1(config)#vlan 10',
    '% Invalid input detected at \'^\' marker.',
    'SW1(config)#switchport mode access',
    'error: syntax error, expecting <command>',
    'SW1(config)#end',
  ].join('\n');

  const errors = summarizeConfigErrors(output);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /Invalid input/);
  assert.match(errors[1], /syntax error/);
});

test('normalizeForHash ignores volatile timestamp lines', () => {
  const first = 'version 15.2\n! Last configuration change at 10:00:00 UTC Mon Jan 1 2026\nhostname SW1';
  const second = 'version 15.2\n! Last configuration change at 22:31:12 UTC Tue Jan 2 2026\nhostname SW1';
  assert.equal(normalizeForHash(first), normalizeForHash(second));
  assert.notEqual(normalizeForHash(first), normalizeForHash('version 15.3\nhostname SW1'));
});

test('truncate caps long strings and adds a marker', () => {
  assert.equal(truncate('short', 100), 'short');
  const result = truncate('x'.repeat(50), 10);
  assert.match(result, /^x{10}\n\.\.\. \[truncated 40 characters\]$/);
});
