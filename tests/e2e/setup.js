import { beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import '../../server/models.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://admin:password@localhost:27017/talentflow_test?authSource=admin';

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI);
  }
});

beforeEach(async () => {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});
