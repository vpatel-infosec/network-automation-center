import test from 'node:test';
import assert from 'node:assert/strict';
import { extractVariables, mergeVariables, renderTemplate } from '../src/services/templateService.js';

test('extractVariables finds mustache variables and ignores helpers', () => {
  const content = [
    'hostname {{hostname}}',
    'vlan {{vlan_id}}',
    '{{#if description}}description {{description}}{{/if}}',
    '{{! a comment }}',
    'interface {{device.name}}',
  ].join('\n');

  assert.deepEqual(extractVariables(content), ['hostname', 'vlan_id', 'description', 'device.name']);
});

test('mergeVariables keeps declared metadata and adds undeclared variables', () => {
  const declared = [{ name: 'hostname', label: 'Hostname', required: true, defaultValue: 'SW1' }];
  const merged = mergeVariables('hostname {{hostname}}\nntp {{ntpServer}}', declared);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].label, 'Hostname');
  assert.equal(merged[1].name, 'ntpServer');
  assert.equal(merged[1].required, true);
});

test('renderTemplate applies defaults, provided values and device context', () => {
  const template = {
    name: 'vlan',
    content: 'hostname {{device.name}}\nvlan {{vlan}}',
    variables: [{ name: 'vlan', defaultValue: '10' }],
  };

  const rendered = renderTemplate(template, {}, { name: 'SW1' });
  assert.equal(rendered, 'hostname SW1\nvlan 10');

  const withValue = renderTemplate(template, { vlan: '20' }, { name: 'SW2' });
  assert.equal(withValue, 'hostname SW2\nvlan 20');
});

test('renderTemplate fails loudly when a variable is missing (strict mode)', () => {
  const template = { name: 'bad', content: 'vlan {{vlanId}}', variables: [] };
  assert.throws(() => renderTemplate(template, {}, { name: 'SW1' }), /rendering failed/);
});

test('renderTemplate works without a device (preview mode)', () => {
  const template = {
    name: 'preview',
    content: 'hostname {{device.name}}',
    variables: [],
  };
  assert.match(renderTemplate(template, {}), /hostname DEMO-SW01/);
});
