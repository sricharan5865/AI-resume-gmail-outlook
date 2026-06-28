import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import mongoose from 'mongoose';

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

describe('Resume Upload and Parsing API (Feature 1)', () => {
  const dummyPath = path.resolve(__dirname, './dummy_resume.pdf');

  beforeAll(async () => {
    await createDummyPDF(dummyPath, 'John Doe\nEmail: john@example.com\nSkills: JavaScript, Node.js');
  });

  afterAll(() => {
    if (fs.existsSync(dummyPath)) {
      fs.unlinkSync(dummyPath);
    }
  });

  // TIER 1 - Feature Coverage (>=5 tests)
  test('1. parser outputs HR and Tech Q&As on valid resume upload', async () => {
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(dummyPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('resume', blob, 'dummy_resume.pdf');

    const res = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.candidate).toBeDefined();
    expect(data.candidate.hrQuestions).toBeInstanceOf(Array);
    expect(data.candidate.hrQuestions.length).toBeGreaterThanOrEqual(5);
    expect(data.candidate.technicalQuestions).toBeInstanceOf(Array);
    expect(data.candidate.technicalQuestions.length).toBeGreaterThanOrEqual(5);
  });

  test('2. resume upload with jobId targets generated Q&As to job', async () => {
    // Create a mock job first
    const jobRes = await fetch('http://localhost:5001/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'job-123',
        title: 'Senior React Developer',
        description: 'React, Redux, frontend architecture'
      })
    });
    expect(jobRes.status).toBe(200);

    const formData = new FormData();
    const fileBuffer = fs.readFileSync(dummyPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('resume', blob, 'dummy_resume.pdf');
    formData.append('jobId', 'job-123');

    const res = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.candidate.jobId).toBe('job-123');
  });

  test('3. resume upload defaults to general role without jobId', async () => {
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(dummyPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('resume', blob, 'dummy_resume.pdf');

    const res = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.candidate.jobId).toBeUndefined();
  });

  test('4. Q&A items match schema structure', async () => {
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(dummyPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('resume', blob, 'dummy_resume.pdf');

    const res = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    
    const hrQ = data.candidate.hrQuestions[0];
    expect(hrQ).toHaveProperty('question');
    expect(hrQ).toHaveProperty('answer');
    expect(typeof hrQ.question).toBe('string');
    expect(typeof hrQ.answer).toBe('string');
  });

  test('5. multiple uploads generate unique candidates and store distinct Q&As', async () => {
    const uploadFunc = async (name, email) => {
      const p = path.resolve(__dirname, `./dummy_${name}.pdf`);
      await createDummyPDF(p, `${name}\nEmail: ${email}`);
      const formData = new FormData();
      const fileBuffer = fs.readFileSync(p);
      const blob = new Blob([fileBuffer], { type: 'application/pdf' });
      formData.append('resume', blob, `dummy_${name}.pdf`);
      
      const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
      fs.unlinkSync(p);
      return res.json();
    };

    const c1 = await uploadFunc('Alice', 'alice@example.com');
    const c2 = await uploadFunc('Bob', 'bob@example.com');

    expect(c1.candidate.id).not.toBe(c2.candidate.id);
  });

  // TIER 2 - Boundary & Corner Cases (>=5 tests)
  test('6. upload non-PDF file returns validation error', async () => {
    const badPath = path.resolve(__dirname, './bad.txt');
    fs.writeFileSync(badPath, 'Not a pdf');
    
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(badPath);
    const blob = new Blob([fileBuffer], { type: 'text/plain' });
    formData.append('resume', blob, 'bad.txt');

    const res = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData
    });
    fs.unlinkSync(badPath);

    expect(res.status).toBe(500);
  });

  test('7. upload with missing resume file returns 400', async () => {
    const formData = new FormData();
    formData.append('jobId', 'job-123');

    const res = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData
    });
    expect(res.status).toBe(400);
  });

  test('8. upload empty file handles failure gracefully', async () => {
    const emptyPath = path.resolve(__dirname, './empty.pdf');
    fs.writeFileSync(emptyPath, '');

    const formData = new FormData();
    const fileBuffer = fs.readFileSync(emptyPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('resume', blob, 'empty.pdf');

    const res = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData
    });
    fs.unlinkSync(emptyPath);

    expect([200, 400, 500]).toContain(res.status);
  });

  test('9. upload with invalid jobId handles gracefully', async () => {
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(dummyPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('resume', blob, 'dummy_resume.pdf');
    formData.append('jobId', 'non-existent-job-id');

    const res = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData
    });
    expect([200, 404, 400]).toContain(res.status);
  });

  test('10. upload resume with special characters in candidate details succeeds', async () => {
    const specPath = path.resolve(__dirname, './special.pdf');
    await createDummyPDF(specPath, 'Ændrew Smíth\nEmail: andrew@example.com\nSpecialties: C++, Rust & Go');

    const formData = new FormData();
    const fileBuffer = fs.readFileSync(specPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('resume', blob, 'special.pdf');

    const res = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData
    });
    fs.unlinkSync(specPath);
    expect(res.status).toBe(200);
  });
});
