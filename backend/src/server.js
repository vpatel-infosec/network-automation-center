import http from 'node:http';
import app from './app.js';
import config from './config/env.js';
import logger from './utils/logger.js';
import { connectDb, disconnectDb } from './config/db.js';
import { initSocket } from './socket.js';
import { setIo } from './socketBus.js';
import { reloadAll, stopAll } from './services/schedulerService.js';

async function main() {
  const server = http.createServer(app);
  const io = initSocket(server);
  setIo(io);

  await connectDb();
  await reloadAll();

  server.listen(config.port, () => {
    logger.info(
      `Network Automation Center API listening on port ${config.port} (${config.isProd ? 'production' : 'development'})`
    );
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    stopAll();
    server.close(() => logger.info('HTTP server closed'));
    await disconnectDb().catch(() => {});
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error(`Fatal startup error: ${error.stack || error.message}`);
  process.exit(1);
});
