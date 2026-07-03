import mongoose from 'mongoose';
import { Settings } from './models.js';

mongoose.connect('mongodb://admin:password@localhost:27017/talentflow?authSource=admin')
  .then(async () => {
    const settings = await Settings.findById('global').lean();
    console.log('Current Settings:', JSON.stringify(settings, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
