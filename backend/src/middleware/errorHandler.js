import mongoose from 'mongoose';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import AppError from '../utils/AppError.js';

export function notFound(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  let status = error.status || (error instanceof AppError ? error.status : 500);
  let message = error.message || 'Internal server error';
  let details = error.details;

  if (error instanceof mongoose.Error.ValidationError) {
    status = 400;
    details = Object.values(error.errors).map((item) => item.message);
    message = 'Validation failed';
  }
  if (error instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid value for "${error.path}"`;
  }
  if (error.code === 11000) {
    status = 409;
    const field = Object.keys(error.keyPattern || {}).join(', ') || 'field';
    message = `Duplicate value for ${field}`;
  }
  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${status}: ${error.stack || error.message}`);
    if (config.isProd) message = 'Internal server error';
  }

  res.status(status).json({ message, ...(details ? { details } : {}) });
}

export default { notFound, errorHandler };
