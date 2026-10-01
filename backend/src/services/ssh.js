import ssh2 from 'ssh2';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import AppError from '../utils/AppError.js';

const { Client } = ssh2;

// eslint-disable-next-line no-control-regex
const ANSI_RE = /[\u001B\u009B][[\]()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><])/g;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stripEcho(text, command) {
  let out = text;
  if (command) {
    const nl = out.indexOf('\n');
    const first = nl === -1 ? out : out.slice(0, nl);
    const trimmed = first.trim();
    if (trimmed === command.trim() || trimmed.endsWith(command.trim())) {
      out = nl === -1 ? '' : out.slice(nl + 1);
    }
  }
  return out;
}

function stripTrailingPrompt(text, patterns) {
  const lines = String(text ?? '').split('\n');
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length && patterns.some((pattern) => pattern.test(lines[lines.length - 1]))) lines.pop();
  return lines.join('\n').replace(/\s+$/, '');
}

/**
 * Interactive SSH CLI session. A shell channel is used (not exec) because
 * network devices only run their full CLI interactively; each command is
 * written and we wait for the device prompt to come back.
 */
export class SshConnection {
  constructor({ host, port = 22, username, password, privateKey, passphrase, prompt = /[>#]\s*$/, name = '' }) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
    this.privateKey = privateKey;
    this.passphrase = passphrase;
    this.prompt = prompt;
    this.name = name || host;
    this.buffer = '';
    this.transcript = '';
    this.client = null;
    this.stream = null;
    this.closed = false;
    this._waiter = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const client = new Client();
      this.client = client;
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        try { client.end(); } catch { /* noop */ }
        reject(new AppError(`SSH connection to ${this.name} (${this.host}:${this.port}) failed: ${error.message}`, 502));
      };
      client.once('ready', async () => {
        try {
          await this._openShell();
          settled = true;
          resolve();
        } catch (error) {
          fail(error);
        }
      });
      client.once('error', fail);
      client.once('timeout', () => fail(new Error('connection timed out')));
      client.on('close', () => { this.closed = true; });
      try {
        client.connect({
          host: this.host,
          port: this.port,
          username: this.username,
          password: this.password || undefined,
          privateKey: this.privateKey || undefined,
          passphrase: this.passphrase || undefined,
          readyTimeout: config.ssh.readyTimeoutMs,
          keepaliveInterval: 10000,
          keepaliveCountMax: 3,
        });
      } catch (error) {
        fail(error);
      }
    });
  }

  _openShell() {
    return new Promise((resolve, reject) => {
      this.client.shell({ term: 'vt100', cols: 512, rows: 48 }, (error, stream) => {
        if (error) return reject(error);
        this.stream = stream;
        stream.on('data', (chunk) => this._onData(chunk));
        if (stream.stderr) stream.stderr.on('data', (chunk) => this._onData(chunk));
        stream.on('close', () => { this.closed = true; });
        return resolve();
      });
    });
  }

  _onData(chunk) {
    const text = chunk.toString('utf8').replace(ANSI_RE, '').replace(/\r/g, '');
    if (!text) return;
    this.buffer += text;
    this.transcript += text;
    if (this._waiter) this._waiter();
  }

  _assertReady() {
    if (!this.stream || this.closed) throw new AppError(`SSH session to ${this.name} is not open`, 502);
  }

  _waitForBuffer(matcher, timeout, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._waiter = null;
        reject(new AppError(`Timed out after ${timeout}ms waiting for ${label} on ${this.name}`, 504));
      }, timeout);
      const check = () => {
        if (!matcher(this.buffer)) return;
        this._waiter = null;
        clearTimeout(timer);
        resolve();
      };
      this._waiter = check;
      check();
    });
  }

  /**
   * Send a command and wait for the prompt (or one of the `expect` patterns,
   * e.g. an interactive "(y/n)?" confirmation). Echo and prompt are stripped
   * from the returned text; the raw output stays available in `this.buffer`.
   */
  async runCommand(command, options = {}) {
    this._assertReady();
    const { prompt = this.prompt, timeout = config.ssh.commandTimeoutMs, idleMs = 150, expect = null } = options;
    const extras = Array.isArray(expect) ? expect : expect ? [expect] : [];
    const patterns = [prompt, ...extras];
    this.buffer = '';
    this.stream.write(`${command ?? ''}\n`);
    await this._waitForBuffer(
      (buf) => {
        const trimmed = buf.replace(/\s+$/, '');
        return patterns.some((pattern) => pattern.test(trimmed));
      },
      timeout,
      command ? `output of "${command}"` : 'prompt'
    );
    await sleep(idleMs);
    return stripTrailingPrompt(stripEcho(this.buffer, command), patterns);
  }

  /**
   * Batch mode: write every line without waiting (config mode emits no prompt
   * per line), then run the `then` commands with normal synchronisation and
   * return the captured transcript section.
   */
  async runRaw(lines, { then = [], settleMs = 120, timeout = config.ssh.commandTimeoutMs } = {}) {
    this._assertReady();
    const startIndex = this.transcript.length;
    this.buffer = '';
    for (const line of lines) {
      this._assertReady();
      this.stream.write(`${line}\n`);
      await sleep(settleMs);
    }
    for (const command of then) {
      await this.runCommand(command, { timeout });
    }
    await sleep(150);
    return stripTrailingPrompt(this.transcript.slice(startIndex), [this.prompt]);
  }

  lastLines(count = 3) {
    return this.transcript
      .split('\n')
      .filter((line) => line.trim() !== '')
      .slice(-count)
      .join('\n');
  }

  close() {
    this.closed = true;
    this._waiter = null;
    try { this.stream?.end(); } catch { /* noop */ }
    try { this.client?.end(); } catch { /* noop */ }
  }
}

/** Ask the device for a prompt to learn whether we are in privileged mode. */
export async function detectPromptMode(conn) {
  await conn.runCommand('', { timeout: 15000, idleMs: 250 });
  const last = conn.lastLines(1);
  if (/#\s*$/.test(last)) return 'privileged';
  if (/(?:>|%)\s*$/.test(last)) return 'unprivileged';
  return 'unknown';
}

/** Enter privileged (enable) mode when the CLI requires it. */
export async function enterEnableMode(conn, enablePassword) {
  const mode = await detectPromptMode(conn);
  if (mode !== 'unprivileged') return { alreadyEnabled: true };

  conn.buffer = '';
  conn.stream.write('enable\n');
  await sleep(1200);
  const askedForPassword = /(?:password|passcode|secret)\s*:?\s*$/im.test(conn.buffer.replace(/\s+$/, ''));

  if (!askedForPassword) {
    await conn.runCommand('', { timeout: 15000, idleMs: 250 });
    logger.debug(`"enable" accepted without password on ${conn.name}`);
    return { alreadyEnabled: false };
  }
  if (!enablePassword) {
    throw new AppError(`Device ${conn.name} requires an enable password but none is configured in the credential set`, 400);
  }
  await conn.runCommand(enablePassword, { timeout: 15000, idleMs: 250 });
  return { alreadyEnabled: false };
}

export default SshConnection;

