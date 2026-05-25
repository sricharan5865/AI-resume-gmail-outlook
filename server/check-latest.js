import mongoose from 'mongoose';
import { Candidate } from './models.js';

mongoose.connect('mongodb://admin:password@localhost:27017/talentflow?authSource=admin')
  .then(async () => {
    const candidates = await Candidate.find().sort({_id: -1}).limit(5).lean();
    for (const c of candidates) {
      console.log(`Candidate ${c.id}: name=${c.name}, linkedin=${c.linkedinUrl}, resumeUrl=${c.resumeUrl}, filename=${c.history[0]?.text}`);
    }
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
