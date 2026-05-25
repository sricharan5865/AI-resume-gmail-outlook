import mongoose from 'mongoose';
import { ProcessedEmail } from './models.js';

mongoose.connect('mongodb://admin:password@localhost:27017/talentflow?authSource=admin')
  .then(async () => {
    const res = await ProcessedEmail.deleteMany({});
    console.log(`Cleared ${res.deletedCount} emails from ProcessedEmail collection!`);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
