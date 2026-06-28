import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

const API_URL = 'http://localhost:5001/api/candidates';

function createDummyPDF(filePath, text) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.text(text);
    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

describe('E2E Cross-Feature Combinations (Tier 3)', () => {
  const dummyPath = path.resolve(__dirname, './dummy_combo.pdf');

  beforeAll(async () => {
    await createDummyPDF(dummyPath, 'James Smith\nEmail: james@example.com\nSkills: React, Redux');
  });

  afterAll(() => {
    if (fs.existsSync(dummyPath)) {
      fs.unlinkSync(dummyPath);
    }
  });

  test('1. upload resume then regenerate immediately updates questions', async () => {
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(dummyPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('resume', blob, 'dummy_combo.pdf');

    const uploadRes = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData
    });
    expect(uploadRes.status).toBe(200);
    const uploadData = await uploadRes.json();
    const candId = uploadData.candidate.id;
    expect(candId).toBeDefined();

    const regenRes = await fetch(`${API_URL}/${candId}/generate-questions`, {
      method: 'POST'
    });
    expect(regenRes.status).toBe(200);
    const regenData = await regenRes.json();
    expect(regenData.hrQuestions.length).toBeGreaterThanOrEqual(5);
  });

  test('2. create job, upload resume for job, then regenerate', async () => {
    const jobRes = await fetch('http://localhost:5001/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'job-combo-1',
        title: 'Backend Engineer',
        description: 'Node, Express, MongoDB'
      })
    });
    expect(jobRes.status).toBe(200);

    const formData = new FormData();
    const fileBuffer = fs.readFileSync(dummyPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('resume', blob, 'dummy_combo.pdf');
    formData.append('jobId', 'job-combo-1');

    const uploadRes = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData
    });
    expect(uploadRes.status).toBe(200);
    const uploadData = await uploadRes.json();
    const candId = uploadData.candidate.id;

    const regenRes = await fetch(`${API_URL}/${candId}/generate-questions`, {
      method: 'POST'
    });
    expect(regenRes.status).toBe(200);
    const regenData = await regenRes.json();
    expect(regenData.jobId).toBe('job-combo-1');
  });
});
