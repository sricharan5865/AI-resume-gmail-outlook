import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

const API_URL = 'http://localhost:5001/api';

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

describe('Real-World Recruitment Lifecycle Scenarios (Tier 4)', () => {
  const dummyPath = path.resolve(__dirname, './dummy_scenario.pdf');

  beforeAll(async () => {
    await createDummyPDF(dummyPath, 'Sarah Connor\nEmail: sarah@example.com\nSkills: Python, Django');
  });

  afterAll(() => {
    if (fs.existsSync(dummyPath)) {
      fs.unlinkSync(dummyPath);
    }
  });

  test('Scenario 1: Complete Recruitment Lifecycle', async () => {
    const jobRes = await fetch(`${API_URL}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'job-scenario-1',
        title: 'Python Django Engineer',
        description: 'Design REST APIs using Python and Django.'
      })
    });
    expect(jobRes.status).toBe(200);

    const formData = new FormData();
    const fileBuffer = fs.readFileSync(dummyPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('resume', blob, 'dummy_scenario.pdf');
    formData.append('jobId', 'job-scenario-1');

    const uploadRes = await fetch(`${API_URL}/candidates/upload`, {
      method: 'POST',
      body: formData
    });
    expect(uploadRes.status).toBe(200);
    const uploadData = await uploadRes.json();
    const candId = uploadData.candidate.id;

    expect(uploadData.candidate.matchScore).toBeGreaterThanOrEqual(0);
    expect(uploadData.candidate.hrQuestions).toBeInstanceOf(Array);

    const regenRes = await fetch(`${API_URL}/candidates/${candId}/generate-questions`, {
      method: 'POST'
    });
    expect(regenRes.status).toBe(200);
    const regenData = await regenRes.json();
    expect(regenData.hrQuestions.length).toBeGreaterThanOrEqual(5);

    const getRes = await fetch(`${API_URL}/candidates`);
    expect(getRes.status).toBe(200);
    const list = await getRes.json();
    const candidate = list.find(c => c.id === candId);
    expect(candidate).toBeDefined();
    expect(candidate.hrQuestions.length).toBeGreaterThanOrEqual(5);
  });

  test('Scenario 2: Email Ingestion Sourcing Lifecycle', async () => {
    const jobRes = await fetch(`${API_URL}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'job-scenario-2',
        title: 'Fullstack JavaScript Developer',
        description: 'React, Node.js, Mongoose'
      })
    });
    expect(jobRes.status).toBe(200);

    const resolveRes = await fetch(`${API_URL}/candidates/upload/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete-before',
        parsedData: {
          name: "John Doe Sourced",
          email: "sourced@example.com",
          skills: ["React", "Node.js"],
          experience: [],
          education: [],
          seniorityLevel: "Mid"
        },
        pdfText: "John Doe Sourced, expert in Node and React",
        tempFile: "dummy_temp.pdf",
        jobId: "job-scenario-2"
      })
    });
    expect(resolveRes.status).toBe(200);
    const resolveData = await resolveRes.json();
    const candId = resolveData.candidate.id;

    const regenRes = await fetch(`${API_URL}/candidates/${candId}/generate-questions`, {
      method: 'POST'
    });
    expect(regenRes.status).toBe(200);
    const regenData = await regenRes.json();
    expect(regenData.hrQuestions.length).toBeGreaterThanOrEqual(5);

    const stageRes = await fetch(`${API_URL}/candidates/${candId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'Screening' })
    });
    expect(stageRes.status).toBe(200);
    const stageData = await stageRes.json();
    expect(stageData.stage).toBe('Screening');
  });

  test('Scenario 3: Bulk Ingestion And Evaluation', async () => {
    const uploadFunc = async (name, email) => {
      const p = path.resolve(__dirname, `./${name}.pdf`);
      await createDummyPDF(p, `${name}\nEmail: ${email}\nSkills: React`);
      const formData = new FormData();
      const fileBuffer = fs.readFileSync(p);
      const blob = new Blob([fileBuffer], { type: 'application/pdf' });
      formData.append('resume', blob, `${name}.pdf`);
      const res = await fetch(`${API_URL}/candidates/upload`, { method: 'POST', body: formData });
      fs.unlinkSync(p);
      return res.json();
    };

    const c1 = await uploadFunc('AliceScenario', 'alice_s@example.com');
    const c2 = await uploadFunc('BobScenario', 'bob_s@example.com');
    
    expect(c1.candidate).toBeDefined();
    expect(c2.candidate).toBeDefined();

    const regenRes = await fetch(`${API_URL}/candidates/${c2.candidate.id}/generate-questions`, {
      method: 'POST'
    });
    expect(regenRes.status).toBe(200);
  });

  test('Scenario 4: Settings Change and Tag Preferences Regeneration', async () => {
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(dummyPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('resume', blob, 'dummy_scenario.pdf');

    const uploadRes = await fetch(`${API_URL}/candidates/upload`, {
      method: 'POST',
      body: formData
    });
    expect(uploadRes.status).toBe(200);
    const uploadData = await uploadRes.json();
    const candId = uploadData.candidate.id;

    const settingsRes = await fetch(`${API_URL}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tagPreferences: [
          { category: "Framework", description: "React, Django, Angular" },
          { category: "Seniority", description: "Junior, Mid, Senior" }
        ],
        aiProvider: "gemini"
      })
    });
    expect(settingsRes.status).toBe(200);

    const regenRes = await fetch(`${API_URL}/candidates/${candId}/generate-questions`, {
      method: 'POST'
    });
    expect(regenRes.status).toBe(200);
  });

  test('Scenario 5: Job Update and Questions Sync', async () => {
    const jobRes = await fetch(`${API_URL}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'job-scenario-5',
        title: 'Initial Title',
        description: 'Initial job description'
      })
    });
    expect(jobRes.status).toBe(200);

    const formData = new FormData();
    const fileBuffer = fs.readFileSync(dummyPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('resume', blob, 'dummy_scenario.pdf');
    formData.append('jobId', 'job-scenario-5');

    const uploadRes = await fetch(`${API_URL}/candidates/upload`, {
      method: 'POST',
      body: formData
    });
    expect(uploadRes.status).toBe(200);
    const uploadData = await uploadRes.json();
    const candId = uploadData.candidate.id;

    const updateJobRes = await fetch(`${API_URL}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'job-scenario-5',
        title: 'Updated Python Lead',
        description: 'Lead engineer with Python, Django and AWS expert knowledge.'
      })
    });
    expect(updateJobRes.status).toBe(200);

    const regenRes = await fetch(`${API_URL}/candidates/${candId}/generate-questions`, {
      method: 'POST'
    });
    expect(regenRes.status).toBe(200);
  });
});
