import Handlebars from 'handlebars';
import Template from '../models/Template.js';
import AppError from '../utils/AppError.js';

const RESERVED = new Set(['else', 'this', 'true', 'false', 'null', 'undefined']);
const VARIABLE_RE = /{{{?\s*([A-Za-z_][A-Za-z0-9_.]*)\s*}?}}/g;

/** Names used in {{mustache}} expressions, ignoring helpers and block tokens. */
export function extractVariables(content) {
  const found = new Set();
  const regex = new RegExp(VARIABLE_RE.source, 'g');
  let match = regex.exec(String(content ?? ''));
  while (match !== null) {
    const name = match[1];
    if (!RESERVED.has(name)) found.add(name);
    match = regex.exec(String(content ?? ''));
  }
  return [...found];
}

/** Keep declared metadata, add entries for variables that are used but undeclared. */
export function mergeVariables(content, declared = []) {
  const names = extractVariables(content);
  const byName = new Map((declared || []).map((variable) => [variable.name, variable]));
  return names.map(
    (name) => byName.get(name) || { name, label: name, description: '', required: true, defaultValue: '' }
  );
}

/** Compile once at save time so syntax errors surface immediately. */
export function assertCompiles(content) {
  try {
    Handlebars.create().compile(String(content));
  } catch (error) {
    throw new AppError(`Template syntax error: ${error.message}`, 400);
  }
}

function buildContext(template, provided, device) {
  const context = {};
  for (const variable of template.variables || []) {
    if (variable.defaultValue !== undefined && variable.defaultValue !== '') {
      context[variable.name] = variable.defaultValue;
    }
  }
  Object.assign(context, provided || {});
  const source = device || previewDevice();
  context.device = {
    id: source._id ? String(source._id) : '',
    name: source.name,
    host: source.host,
    vendor: source.vendor,
    deviceType: source.deviceType,
    model: source.model || '',
    platform: source.platform || '',
    osVersion: source.osVersion || '',
    location: source.location || '',
    tags: source.tags || [],
  };
  for (const key of ['name', 'host', 'vendor', 'deviceType', 'model', 'platform', 'osVersion', 'location']) {
    if (context[key] === undefined) context[key] = source[key] ?? '';
  }
  return context;
}

function previewDevice() {
  return {
    _id: 'preview',
    name: 'DEMO-SW01',
    host: '10.0.0.10',
    vendor: 'cisco',
    deviceType: 'switch',
    model: 'Catalyst 9300',
    platform: 'IOS-XE',
    osVersion: '17.9.4',
    location: 'HQ / Floor 1',
    tags: ['demo'],
  };
}

/**
 * Render a template. `strict: true` turns a missing variable into a clear
 * error instead of silently generating a broken configuration.
 */
export function renderTemplate(template, provided = {}, device = null) {
  const compiled = Handlebars.create().compile(String(template.content), { noEscape: true, strict: true });
  try {
    return compiled(buildContext(template, provided, device));
  } catch (error) {
    throw new AppError(`Template "${template.name}" rendering failed: ${error.message}`, 400);
  }
}

export async function listTemplates() {
  return Template.find().sort({ name: 1 });
}

export async function getTemplate(id) {
  const template = await Template.findById(id);
  if (!template) throw new AppError('Template not found', 404);
  return template;
}

export async function createTemplate(payload, user) {
  assertCompiles(payload.content);
  const template = new Template({
    ...payload,
    variables: mergeVariables(payload.content, payload.variables),
    createdBy: user?._id,
  });
  await template.save();
  return template;
}

export async function updateTemplate(id, payload) {
  const template = await getTemplate(id);
  if (payload.content !== undefined && payload.content !== template.content) assertCompiles(payload.content);
  Object.assign(template, payload);
  template.variables = mergeVariables(template.content, payload.variables ?? template.variables);
  await template.save();
  return template;
}

export async function deleteTemplate(id) {
  const template = await Template.findByIdAndDelete(id);
  if (!template) throw new AppError('Template not found', 404);
  return template;
}

export default {
  extractVariables,
  mergeVariables,
  renderTemplate,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
};
