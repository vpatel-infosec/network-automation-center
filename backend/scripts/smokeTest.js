/**
 * End-to-end API smoke test.
 *
 *   node scripts/smokeTest.js                 # uses MONGODB_URI
 *   node scripts/smokeTest.js --memory        # spins up an in-memory MongoDB
 *
 * Boots the real Express app on an ephemeral port, creates a temporary admin
 * account and walks through auth, meta, credentials, devices, jobs, templates,
 * schedules, audit and dashboard endpoints. Everything it creates is removed
 * again before it exits, so it is safe to run against a development database.
 */
import http from 'node:http';
import app from '../src/app.js';
import config from '../src/config/env.js';
import User from '../src/models/User.js';
import Device from '../src/models/Device.js';
import Credential from '../src/models/Credential.js';
import ConfigVersion from '../src/models/ConfigVersion.js';
import Job from '../src/models/Job.js';
import Schedule from '../src/models/Schedule.js';
import Template from '../src/models/Template.js';
import AuditLog from '../src/models/AuditLog.js';
import { connectDb, disconnectDb } from '../src/config/db.js';

const results = [];

function check(name, condition, extra = '') {
  results.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
}

async function call(baseUrl, method, path, { token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

async function cleanup(marker) {
  const rx = new RegExp(marker);
  await Promise.all([
    Job.deleteMany({ name: rx }),
    AuditLog.deleteMany({ userName: marker }),
    User.deleteMany({ email: rx }),
    Device.deleteMany({ name: rx }),
    Credential.deleteMany({ name: rx }),
    Schedule.deleteMany({ name: rx }),
    Template.deleteMany({ name: rx }),
    ConfigVersion.deleteMany({ note: marker }),
  ]);
}

/** Optional in-memory MongoDB so the smoke test also works without a database server. */
async function startMemoryMongo() {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const server = await MongoMemoryServer.create({ instance: { dbName: 'network_automation' } });
  config.mongoUri = server.getUri();
  console.log(`In-memory MongoDB started at ${config.mongoUri}`);
  return server;
}

async function main() {
  const memoryServer = process.argv.includes('--memory') ? await startMemoryMongo() : null;
  await connectDb(3);

  const marker = `smoke-${Date.now()}`;
  const email = `${marker}@example.com`;
  const password = 'SmokeTest123!';

  await cleanup(marker);
  await User.create({
    name: marker,
    email,
    passwordHash: await User.hashPassword(password),
    role: 'admin',
    active: true,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log(`Smoke test API listening on ${baseUrl}\n`);

  try {
    const health = await call(baseUrl, 'GET', '/api/health');
    check('health endpoint responds', health.status === 200 && health.data.status === 'ok');

    const unauth = await call(baseUrl, 'GET', '/api/devices');
    check('unauthenticated API access is rejected', unauth.status === 401, `status ${unauth.status}`);

    const login = await call(baseUrl, 'POST', '/api/auth/login', { body: { email, password } });
    check('login returns a JWT', login.status === 200 && Boolean(login.data.token));
    const token = login.data.token;

    const wrong = await call(baseUrl, 'POST', '/api/auth/login', {
      body: { email, password: 'definitely-wrong' },
    });
    check('wrong password is rejected', wrong.status === 401, `status ${wrong.status}`);

    const meta = await call(baseUrl, 'GET', '/api/meta', { token });
    check(
      'meta exposes the driver catalog',
      meta.status === 200 && meta.data.driverCatalog.length === 8,
      `${meta.data?.driverCatalog?.length} drivers`
    );

    const credential = await call(baseUrl, 'POST', '/api/credentials', {
      token,
      body: { name: `${marker}-cred`, username: 'netops', password: 'secret', enablePassword: 'enable' },
    });
    check('credential set is created', credential.status === 201, credential.data?.message);
    const stored = credential.data?.credential || {};
    check(
      'credential secrets are encrypted and never returned',
      stored.passwordEnc === undefined && stored.hasPassword === true && stored.hasEnablePassword === true
    );

    const device = await call(baseUrl, 'POST', '/api/devices', {
      token,
      body: {
        name: `${marker}-sw1`,
        host: '192.0.2.10',
        vendor: 'cisco',
        deviceType: 'switch',
        credential: stored._id,
        tags: ['smoke'],
      },
    });
    check('device is created', device.status === 201, device.data?.message);
    const deviceId = device.data?.device?._id;

    const list = await call(baseUrl, 'GET', '/api/devices?q=smoke', { token });
    check(
      'device search works',
      list.status === 200 && list.data.items.some((item) => item.name === `${marker}-sw1`)
    );

    const test = await call(baseUrl, 'POST', `/api/devices/${deviceId}/test`, { token });
    check(
      'connection test degrades gracefully for an unreachable device',
      test.status === 200 && test.data.reachable === false,
      String(test.data?.error || '').slice(0, 60)
    );

    const backupJob = await call(baseUrl, 'POST', '/api/jobs', {
      token,
      body: { type: 'backup', name: `${marker}-backup`, deviceIds: [deviceId] },
    });
    check('backup job is queued', backupJob.status === 202, backupJob.data?.message);
    const jobId = backupJob.data?.job?._id;

    let job = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const current = await call(baseUrl, 'GET', `/api/jobs/${jobId}`, { token });
      job = current.data?.job;
      if (job && ['completed', 'failed', 'partial', 'cancelled'].includes(job.status)) break;
    }
    check(
      'job runner finishes and records a per-device result',
      job?.status === 'failed' && job?.results?.[0]?.status === 'failed',
      `job=${job?.status} result=${job?.results?.[0]?.status}`
    );

    const template = await call(baseUrl, 'POST', '/api/templates', {
      token,
      body: { name: `${marker}-tpl`, content: 'hostname {{hostname}}\nvlan {{vlan}}' },
    });
    check(
      'template is created with extracted variables',
      template.status === 201 && template.data.template.variables.some((v) => v.name === 'vlan'),
      template.data?.message
    );
    const templateId = template.data?.template?._id;

    const preview = await call(baseUrl, 'POST', `/api/templates/${templateId}/preview`, {
      token,
      body: { variables: { hostname: 'SW1', vlan: '20' } },
    });
    check(
      'template preview renders the supplied variables',
      preview.status === 200 && preview.data.rendered.includes('vlan 20'),
      String(preview.data?.rendered || '').replace(/\n/g, ' | ')
    );

    const missing = await call(baseUrl, 'POST', `/api/templates/${templateId}/preview`, {
      token,
      body: { variables: { hostname: 'SW1' } },
    });
    check(
      'a missing template variable fails loudly',
      missing.status === 400,
      String(missing.data?.message).slice(0, 70)
    );

    const schedule = await call(baseUrl, 'POST', '/api/schedules', {
      token,
      body: { name: `${marker}-sched`, type: 'backup', cron: '0 2 * * *', devices: [deviceId] },
    });
    check('schedule is created with a valid cron expression', schedule.status === 201, schedule.data?.message);

    const badSchedule = await call(baseUrl, 'POST', '/api/schedules', {
      token,
      body: { name: `${marker}-bad`, type: 'backup', cron: 'not-a-cron', devices: [deviceId] },
    });
    check(
      'invalid cron expression is rejected',
      badSchedule.status === 400,
      String(badSchedule.data?.message).slice(0, 60)
    );

    const audit = await call(baseUrl, 'GET', '/api/audit?limit=5', { token });
    check(
      'audit log records the performed actions',
      audit.status === 200 && audit.data.items.length > 0,
      `${audit.data?.items?.length} entries`
    );

    const dashboard = await call(baseUrl, 'GET', '/api/dashboard/summary', { token });
    check(
      'dashboard summary aggregates data',
      dashboard.status === 200 && dashboard.data.devices.total >= 1,
      `${dashboard.data?.devices?.total} device(s), ${dashboard.data?.jobs?.recent?.length} recent job(s)`
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await cleanup(marker);
    await disconnectDb();
    if (memoryServer) await memoryServer.stop();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} smoke checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error('Smoke test crashed:', error.message);
  process.exit(1);
});
