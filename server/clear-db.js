import mongoose from 'mongoose';
import { Candidate, Job, ProcessedEmail, Settings } from './models.js';

mongoose.connect('mongodb://admin:password@localhost:27017/talentflow?authSource=admin')
  .then(async () => {
    console.log("Clearing database...");
    
    const candidates = await Candidate.deleteMany({});
    console.log(`Deleted ${candidates.deletedCount} Candidates`);
    
    const jobs = await Job.deleteMany({});
    console.log(`Deleted ${jobs.deletedCount} Jobs`);
    
    const processedEmails = await ProcessedEmail.deleteMany({});
    console.log(`Deleted ${processedEmails.deletedCount} Processed Emails`);
    
    console.log("Database cleared completely. Ready for a fresh start.");
    process.exit(0);
  })
  .catch(err => {
    console.error("Database connection error:", err);
    process.exit(1);
  });
