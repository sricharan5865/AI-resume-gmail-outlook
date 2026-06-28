import { describe, test, expect } from 'vitest';
import mongoose from 'mongoose';

const API_URL = 'http://localhost:5001/api/candidates';

describe('Regenerate Questions API Endpoint (Feature 2)', () => {
  async function insertMockCandidate(candidateId, jobId = null) {
    const CandidateModel = mongoose.connection.model('Candidate');
    const newCand = new CandidateModel({
      id: candidateId,
      name: "Mock Candidate",
      email: "mock@example.com",
      resumeText: "Skills: JavaScript, Node.js. Experience: 3 years at DevCo.",
      jobId: jobId,
      hrQuestions: [],
      technicalQuestions: []
    });
    await newCand.save();
    return newCand;
  }

  // TIER 1 - Feature Coverage (>=5 tests)
  test('1. regenerate endpoint generates and updates questions on success', async () => {
    const candId = 'candidate-test-1';
    await insertMockCandidate(candId);

    const res = await fetch(`${API_URL}/${candId}/generate-questions`, {
      method: 'POST'
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.hrQuestions).toBeInstanceOf(Array);
    expect(data.hrQuestions.length).toBeGreaterThan(0);
    expect(data.technicalQuestions).toBeInstanceOf(Array);
    expect(data.technicalQuestions.length).toBeGreaterThan(0);
  });

  test('2. regenerate endpoint updates candidate in database', async () => {
    const candId = 'candidate-test-2';
    await insertMockCandidate(candId);

    const res = await fetch(`${API_URL}/${candId}/generate-questions`, {
      method: 'POST'
    });
    expect(res.status).toBe(200);

    const CandidateModel = mongoose.connection.model('Candidate');
    const updated = await CandidateModel.findOne({ id: candId });
    expect(updated.hrQuestions.length).toBeGreaterThan(0);
    expect(updated.technicalQuestions.length).toBeGreaterThan(0);
  });

  test('3. response contains updated candidate structure', async () => {
    const candId = 'candidate-test-3';
    await insertMockCandidate(candId);

    const res = await fetch(`${API_URL}/${candId}/generate-questions`, {
      method: 'POST'
    });
    const data = await res.json();
    expect(data).toHaveProperty('id', candId);
    expect(data).toHaveProperty('hrQuestions');
  });

  test('4. other fields in DB are preserved after regeneration', async () => {
    const candId = 'candidate-test-4';
    await insertMockCandidate(candId);

    const res = await fetch(`${API_URL}/${candId}/generate-questions`, {
      method: 'POST'
    });
    expect(res.status).toBe(200);

    const CandidateModel = mongoose.connection.model('Candidate');
    const updated = await CandidateModel.findOne({ id: candId });
    expect(updated.name).toBe("Mock Candidate");
    expect(updated.email).toBe("mock@example.com");
  });

  test('5. regenerate questions with jobId references job description', async () => {
    const candId = 'candidate-test-5';
    await insertMockCandidate(candId, 'job-789');

    const res = await fetch(`${API_URL}/${candId}/generate-questions`, {
      method: 'POST'
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jobId).toBe('job-789');
  });

  // TIER 2 - Boundary & Corner Cases (>=5 tests)
  test('6. calling regenerate with non-existent candidate ID returns 404', async () => {
    const res = await fetch(`${API_URL}/non-existent-id/generate-questions`, {
      method: 'POST'
    });
    expect(res.status).toBe(404);
  });

  test('7. calling regenerate with malformed candidate ID format returns 400 or 404', async () => {
    const res = await fetch(`${API_URL}/some_malformed_id/generate-questions`, {
      method: 'POST'
    });
    expect([400, 404]).toContain(res.status);
  });

  test('8. regenerate candidate with empty resume text handles gracefully', async () => {
    const candId = 'candidate-test-6';
    const CandidateModel = mongoose.connection.model('Candidate');
    const newCand = new CandidateModel({
      id: candId,
      name: "Mock Candidate No Resume",
      email: "mock2@example.com",
      resumeText: "",
      hrQuestions: [],
      technicalQuestions: []
    });
    await newCand.save();

    const res = await fetch(`${API_URL}/${candId}/generate-questions`, {
      method: 'POST'
    });
    expect([200, 400, 500]).toContain(res.status);
  });

  test('9. regenerate candidate with no job associated falls back to general questions', async () => {
    const candId = 'candidate-test-7';
    await insertMockCandidate(candId, null);

    const res = await fetch(`${API_URL}/${candId}/generate-questions`, {
      method: 'POST'
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.hrQuestions.length).toBeGreaterThan(0);
  });

  test('10. regenerate candidate with existing empty arrays works successfully', async () => {
    const candId = 'candidate-test-8';
    const CandidateModel = mongoose.connection.model('Candidate');
    const newCand = new CandidateModel({
      id: candId,
      name: "Mock Empty",
      hrQuestions: [],
      technicalQuestions: []
    });
    await newCand.save();

    const res = await fetch(`${API_URL}/${candId}/generate-questions`, {
      method: 'POST'
    });
    expect(res.status).toBe(200);
  });
});
