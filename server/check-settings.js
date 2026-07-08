import mongoose from 'mongoose';
import { Settings } from './models.js';

mongoose.connect('mongodb://admin:password@localhost:27017/talentflow?authSource=admin')
  .then(async () => {
    const settings = await Settings.findById('global').lean();
    console.log('Settings:', settings);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
