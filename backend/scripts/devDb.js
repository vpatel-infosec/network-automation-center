/**
 * Development MongoDB launcher — no Docker required.
 *
 *   node scripts/devDb.js
 *
 * Starts a real mongod on 127.0.0.1:27017 using the binary that
 * mongodb-memory-server already downloaded, with data persisted in
 * backend/.mongo-data so your devices/jobs survive restarts. Stop it with
 * Ctrl+C (or stop the process from your task manager).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.MONGO_PORT || 27017);
const dbPath = process.env.MONGO_DB_PATH || path.join(root, '.mongo-data');

// mongodb-memory-server scans but does not create the dbPath directory.
fs.mkdirSync(dbPath, { recursive: true });

const server = await MongoMemoryServer.create({
  instance: { port, ip: '127.0.0.1', dbPath },
});

console.log(`MongoDB running at ${server.getUri()} (data directory: ${dbPath})`);
console.log('Leave this process running while the application is in use. Ctrl+C stops it.');

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
