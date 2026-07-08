import mongoose from 'mongoose';
import { Candidate } from './models.js';

mongoose.connect('mongodb://admin:password@localhost:27017/talentflow?authSource=admin')
  .then(async () => {
    const candidate = await Candidate.findOne({ name: /Ankita/i }).lean();
    console.log('SKILLS:', candidate.skills);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
