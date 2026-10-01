import config from '../config/env.js';
import logger from '../utils/logger.js';
import AppError from '../utils/AppError.js';
import { enterEnableMode } from '../services/ssh.js';

export function toLines(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((entry) => toLines(entry));
  return String(value)
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim() !== '');
}

/** device.commandOverrides.<key> (multiline text) wins over the driver default. */
export function resolveCommands(device, driver, key) {
  const override = device?.commandOverrides?.[key];
  if (override && String(override).trim() !== '') return toLines(override);
  return toLines(driver?.commands?.[key]);
}

export function resolvePrompt(device, driver) {
  const pattern = device?.commandOverrides?.prompt;
  if (pattern && String(pattern).trim() !== '') {
    try {
      return new RegExp(pattern, 'm');
    } catch {
      throw new AppError(`Invalid prompt regular expression in device command overrides: ${pattern}`, 400);
    }
  }
  return driver.prompt;
}

const NON_COMMAND_LINE =
  /^(?:!.*|#.*|Building configuration.*|Current configuration.*|Last configuration change.*|NVRAM config last updated.*|Last configuration change at.*|end|exit)$/i;

/** Convert a stored `show running-config` capture back into replayable lines. */
export function filterRestoreLines(content) {
  return toLines(content).filter((line) => !NON_COMMAND_LINE.test(line.trim()));
}

const ERROR_LINE =
  /^\s*%\s*(?:Invalid|Incomplete|Ambiguous|Unrecognized|Unknown|Error)|^\s*error:|syntax error|Invalid input detected|is not a valid|Unknown command/i;

export function summarizeConfigErrors(output) {
  const errors = [];
  for (const raw of String(output ?? '').split('\n')) {
    const line = raw.trim();
    if (line && ERROR_LINE.test(line)) errors.push(line);
  }
  return errors;
}

const VOLATILE_LINE =
  /^(?:!?\s*(?:Last configuration change|NVRAM config last updated|Current configuration|Building configuration|Time:)|#\s*(?:Last|Time|Generated))/i;

/** Strip lines that change on every run so config hashes only move on real edits. */
export function normalizeForHash(content) {
  return String(content ?? '')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => !VOLATILE_LINE.test(line.trim()))
    .join('\n')
    .trim();
}

export function truncate(text, max = 200000) {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n... [truncated ${value.length - max} characters]`;
}

/** Shared driver prepare(): enable mode + disable CLI paging. */
export async function prepareCliSession(conn, device, driver, credential) {
  if (driver.requiresEnable !== false) {
    await enterEnableMode(conn, credential?.enablePassword);
  }
  for (const command of resolveCommands(device, driver, 'disablePaging')) {
    try {
      await conn.runCommand(command, { timeout: 20000 });
    } catch (error) {
      logger.debug(`Disable paging command "${command}" failed on ${conn.name}: ${error.message}`);
    }
  }
}

export async function defaultIdentify(conn, device, driver) {
  const commands = resolveCommands(device, driver, 'identify');
  const command = commands[0] || 'show version';
  return truncate(await conn.runCommand(command, { timeout: 45000 }), 20000);
}

export async function cliBackup(conn, device, driver) {
  const commands = resolveCommands(device, driver, 'backup');
  if (!commands.length) {
    throw new AppError(
      `No backup command configured for driver "${driver.id}". Set a "backup" command under the device's command overrides.`,
      400
    );
  }
  let output = '';
  for (const command of commands) {
    output += `${await conn.runCommand(command, { timeout: config.ssh.longCommandTimeoutMs })}\n`;
  }
  return truncate(output.trim(), 4 * 1024 * 1024);
}

export async function cliRunCommands(conn, device, driver, commands) {
  const results = [];
  for (const command of commands) {
    const startedAt = Date.now();
    try {
      const output = truncate(await conn.runCommand(command, { timeout: config.ssh.longCommandTimeoutMs }));
      results.push({ command, ok: true, output, durationMs: Date.now() - startedAt });
    } catch (error) {
      results.push({ command, ok: false, output: '', error: error.message, durationMs: Date.now() - startedAt });
    }
  }
  return results;
}

const CONFIRM_PROMPT = /\((?:y\/n|yes\/no)\)|\[(?:y\/n|yes\/no)\]/i;

/**
 * Replay configuration lines: enter config mode, stream the lines, exit and
 * persist. Returns the transcript plus every CLI error detected in it.
 */
export async function pushConfigViaCli(conn, device, driver, content, options = {}) {
  const { save = true, timeout = config.ssh.longCommandTimeoutMs } = options;
  const filtered = filterRestoreLines(content);
  const lines = typeof driver.adjustRestoreLines === 'function' ? driver.adjustRestoreLines(filtered, device) : filtered;
  if (!lines.length) throw new AppError('Nothing to push: the rendered configuration contains no usable lines', 400);

  const enter = resolveCommands(device, driver, 'enterConfig');
  const exit = resolveCommands(device, driver, 'exitConfig');
  const saveCommands = save ? resolveCommands(device, driver, 'save') : [];

  for (const command of enter) await conn.runCommand(command, { timeout: 30000 });
  const transcript = await conn.runRaw(lines, { then: [...exit], timeout });

  let saveOutput = '';
  for (const command of saveCommands) {
    const output = await conn.runCommand(command, { timeout: 90000, expect: [CONFIRM_PROMPT] });
    saveOutput += `${output}\n`;
    if (CONFIRM_PROMPT.test(conn.buffer)) {
      saveOutput += `${await conn.runCommand('y', { timeout: 90000 })}\n`;
    }
  }

  const combined = `${transcript}\n${saveOutput}`;
  return { output: truncate(combined), errors: summarizeConfigErrors(combined), lineCount: lines.length };
}

export default {
  toLines,
  resolveCommands,
  resolvePrompt,
  filterRestoreLines,
  summarizeConfigErrors,
  normalizeForHash,
  truncate,
  prepareCliSession,
  defaultIdentify,
  cliBackup,
  cliRunCommands,
  pushConfigViaCli,
};
