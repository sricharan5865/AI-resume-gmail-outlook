import mongoose from 'mongoose';
import { Candidate } from './models.js';

mongoose.connect('mongodb://admin:password@localhost:27017/talentflow?authSource=admin')
  .then(async () => {
    const candidates = await Candidate.find().lean();
    for (const c of candidates) {
      console.log(`Candidate ${c.id}: tags = `, JSON.stringify(c.tags));
    }
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
