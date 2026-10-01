import https from 'node:https';
import config from '../config/env.js';
import AppError from '../utils/AppError.js';

/**
 * Minimal RESTCONF client built on node:https so that self-signed device
 * certificates can be accepted (RESTCONF_VERIFY_TLS=false) without extra
 * dependencies. Used by the cisco_restconf driver for IOS-XE platforms.
 */
export class RestconfSession {
  constructor({ host, port = 443, username, password, verifyTls = config.restconf.verifyTls, timeoutMs = 30000, name = '' }) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
    this.verifyTls = verifyTls;
    this.timeoutMs = timeoutMs;
    this.name = name || host;
  }

  request(method, path, body) {
    const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const headers = {
      Accept: 'application/yang-data+json',
      Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
    };
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/yang-data+json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const options = {
      host: this.host,
      port: this.port,
      path,
      method,
      headers,
      rejectUnauthorized: this.verifyTls,
      agent: false,
      timeout: this.timeoutMs,
    };

    return new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let raw = '';
        response.on('data', (chunk) => { raw += chunk; });
        response.on('end', () => {
          const status = response.statusCode || 0;
          const contentType = String(response.headers['content-type'] || '');
          let data = raw;
          if (contentType.includes('json') && raw.trim() !== '') {
            try { data = JSON.parse(raw); } catch { /* keep raw text */ }
          }
          if (status >= 400) {
            return reject(new AppError(`${this.describe(method, path)} failed with HTTP ${status}: ${this.errorMessage(data)}`, 502));
          }
          return resolve(data);
        });
      });
      request.on('timeout', () => request.destroy(new Error(`request timed out after ${this.timeoutMs}ms`)));
      request.on('error', (error) => reject(new AppError(`${this.describe(method, path)} failed: ${error.message}`, 502)));
      if (payload !== undefined) request.write(payload);
      request.end();
    });
  }

  describe(method, path) {
    return `RESTCONF ${method} ${path} on ${this.name} (${this.host}:${this.port})`;
  }

  errorMessage(data) {
    if (data && typeof data === 'object') {
      const restconfErrors = data['ietf-restconf:errors'];
      const first = restconfErrors?.error?.[0];
      if (first?.['error-message']) return first['error-message'];
      return JSON.stringify(data).slice(0, 500);
    }
    return String(data).slice(0, 500);
  }

  close() {
    // Nothing persistent to release: each request uses its own socket.
  }
}

export default RestconfSession;
