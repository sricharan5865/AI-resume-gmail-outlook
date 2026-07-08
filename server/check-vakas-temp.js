import mongoose from 'mongoose';
import { Candidate } from './models.js';

mongoose.connect('mongodb://admin:password@localhost:27017/talentflow?authSource=admin')
  .then(async () => {
    const candidate = await Candidate.findOne({ name: /Vakas/i }).lean();
    console.log('Keys:', Object.keys(candidate));
    console.log('jobId:', candidate.jobId);
    console.log('jdQuestions:', candidate.jdQuestions);
    console.log('jdTitle:', candidate.jdTitle);
    console.log('hrQuestions length:', candidate.hrQuestions?.length);
    console.log('hrQuestions[0]:', candidate.hrQuestions?.[0]);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
