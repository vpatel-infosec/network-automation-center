import mongoose from 'mongoose';
import config from './env.js';
import logger from '../utils/logger.js';

function redact(uri) {
  return uri.replace(/\/\/[^@/]*@/, '//***@');
}

/**
 * Connect to MongoDB with retries. Docker compose / systemd starts the API at
 * the same time as the database, so a few retries avoid a crash loop.
 */
export async function connectDb(attempts = 10) {
  mongoose.set('strictQuery', true);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
      logger.info(`MongoDB connected (${redact(config.mongoUri)})`);
      return mongoose.connection;
    } catch (error) {
      logger.error(`MongoDB connection attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  return null;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export default connectDb;
