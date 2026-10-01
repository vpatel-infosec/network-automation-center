import winston from 'winston';
import config from '../config/env.js';

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)
);

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: config.logLevel,
  format: config.isProd ? prodFormat : devFormat,
  defaultMeta: { service: 'nac-backend' },
  transports: [new winston.transports.Console()],
});

export default logger;
