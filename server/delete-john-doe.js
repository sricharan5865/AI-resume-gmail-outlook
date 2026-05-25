import mongoose from 'mongoose';
import { Candidate } from './models.js';

mongoose.connect('mongodb://admin:password@localhost:27017/talentflow?authSource=admin')
  .then(async () => {
    const res = await Candidate.deleteMany({ name: 'John Doe' });
    console.log(`Deleted ${res.deletedCount} 'John Doe' candidates.`);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
