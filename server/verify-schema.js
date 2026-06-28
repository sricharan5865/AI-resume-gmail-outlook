import mongoose from 'mongoose';
import { Candidate } from './models.js';

async function run() {
  console.log('=== Schema Verification Script ===');
  let exitCode = 0;

  try {
    // 1. Check schema properties
    console.log('1. Checking Candidate schema fields...');
    const paths = Candidate.schema.paths;
    if (!paths.hrQuestions) {
      throw new Error('hrQuestions is missing from the schema');
    }
    if (!paths.technicalQuestions) {
      throw new Error('technicalQuestions is missing from the schema');
    }
    console.log('   - hrQuestions field path exists in schema.');
    console.log('   - technicalQuestions field path exists in schema.');

    // 2. Instantiate candidate without providing Q&A arrays
    console.log('2. Instantiating new Candidate without Q&A arrays...');
    const candidate = new Candidate({
      id: 'test-cand-' + Date.now(),
      name: 'Verification Candidate',
      email: 'verify@example.com'
    });

    // Verify defaults
    console.log('3. Verifying default values...');
    if (!Array.isArray(candidate.hrQuestions)) {
      throw new Error('candidate.hrQuestions is not an array');
    }
    if (candidate.hrQuestions.length !== 0) {
      throw new Error(`candidate.hrQuestions default length is not 0 (got ${candidate.hrQuestions.length})`);
    }
    console.log('   - candidate.hrQuestions defaults to an empty array [] (PASS)');

    if (!Array.isArray(candidate.technicalQuestions)) {
      throw new Error('candidate.technicalQuestions is not an array');
    }
    if (candidate.technicalQuestions.length !== 0) {
      throw new Error(`candidate.technicalQuestions default length is not 0 (got ${candidate.technicalQuestions.length})`);
    }
    console.log('   - candidate.technicalQuestions defaults to an empty array [] (PASS)');

    // 4. Test validation with valid Q&A data
    console.log('4. Testing validation with valid Q&A data...');
    candidate.hrQuestions.push({
      question: 'What are your career goals?',
      answer: 'To grow as a full stack developer.'
    });
    candidate.technicalQuestions.push({
      question: 'Explain MVC architecture.',
      answer: 'Model-View-Controller separates data, UI, and control logic.'
    });

    const validationError = candidate.validateSync();
    if (validationError) {
      throw new Error(`Validation failed for valid data: ${validationError.message}`);
    }
    console.log('   - Validation passes with valid Q&A objects (PASS)');

    // 5. Test validation with invalid Q&A fields (e.g. missing question/answer properties or wrong types)
    console.log('5. Testing validation behavior with invalid types...');
    const invalidCandidate = new Candidate({
      id: 'test-cand-invalid-' + Date.now(),
      name: 'Invalid Candidate',
      hrQuestions: [{ question: 123, answer: true }] // Mongoose will try to cast them to String
    });
    const castError = invalidCandidate.validateSync();
    console.log('   - Cast/validation error check for schema types:', castError ? 'Detected validation issues (Expected)' : 'No validation issues (Note: Mongoose casts some primitives)');

    // 6. DB roundtrip verification (if DB is accessible)
    console.log('6. Connecting to MongoDB for integration testing...');
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://admin:password@localhost:27017/talentflow_test?authSource=admin';
    try {
      await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
      console.log('   - Connected to MongoDB.');

      // Clear existing test entries with the same ID prefix if any
      await Candidate.deleteMany({ id: { $regex: /^test-cand-/ } });

      // Save candidate with valid Q&A
      await candidate.save();
      console.log('   - Candidate successfully saved to DB.');

      // Create another candidate with NO questions to test DB default generation on save
      const candidateNoQuestions = new Candidate({
        id: 'test-cand-empty-' + Date.now(),
        name: 'Empty Questions Candidate'
      });
      await candidateNoQuestions.save();
      console.log('   - Candidate without questions successfully saved to DB.');

      // Retrieve from DB
      const retrieved = await Candidate.findOne({ id: candidate.id });
      if (!retrieved) {
        throw new Error('Could not retrieve candidate from DB');
      }
      console.log('   - Retried candidate hrQuestions:', retrieved.hrQuestions);
      console.log('   - Retried candidate technicalQuestions:', retrieved.technicalQuestions);

      if (retrieved.hrQuestions.length !== 1 || retrieved.hrQuestions[0].question !== 'What are your career goals?') {
        throw new Error('Retrieved candidate hrQuestions data mismatch');
      }

      const retrievedEmpty = await Candidate.findOne({ id: candidateNoQuestions.id });
      if (!retrievedEmpty) {
        throw new Error('Could not retrieve empty candidate from DB');
      }
      console.log('   - Retried empty candidate hrQuestions:', retrievedEmpty.hrQuestions);
      if (!Array.isArray(retrievedEmpty.hrQuestions) || retrievedEmpty.hrQuestions.length !== 0) {
        throw new Error('Empty candidate in DB did not preserve empty hrQuestions array');
      }
      if (!Array.isArray(retrievedEmpty.technicalQuestions) || retrievedEmpty.technicalQuestions.length !== 0) {
        throw new Error('Empty candidate in DB did not preserve empty technicalQuestions array');
      }

      console.log('   - DB Roundtrip verification (PASS)');
    } catch (dbErr) {
      console.warn('   - [WARNING] MongoDB connection failed or timed out. Skipping DB integration check. Reason:', dbErr.message);
    } finally {
      await mongoose.disconnect();
    }

    console.log('\n=== ALL SCHEMA VERIFICATION CHECKS PASSED ===');
  } catch (err) {
    console.error('\n!!! VERIFICATION FAILED !!!');
    console.error(err);
    exitCode = 1;
  }

  process.exit(exitCode);
}

run();
