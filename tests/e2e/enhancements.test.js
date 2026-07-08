import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { exportToCSV } from '../../client/src/utils/export.js';

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

describe('Enhancements Verification & Stress Test Suite', () => {
  const dummyPath = path.resolve(__dirname, './dummy_enh.pdf');
  let originalFetchInTest = null;
  let candidateId = null;

  beforeAll(async () => {
    // Mock the DOM environment for export tests without overwriting the native URL constructor
    URL.createObjectURL = () => 'mock-blob-url';
    URL.revokeObjectURL = () => {};

    let appendedChild = null;
    let clickCalled = false;
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'a') {
          return {
            setAttribute: (name, val) => {},
            style: {},
            click: () => { clickCalled = true; }
          };
        }
        return {};
      },
      body: {
        appendChild: (child) => { appendedChild = child; },
        removeChild: (child) => { 
          if (appendedChild === child) {
            appendedChild = null;
          }
        }
      }
    };

    // Save and wrap the fetch function to mock embeddings calls
    originalFetchInTest = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlString = typeof url === 'object' ? url.toString() : url;
      if (urlString.includes('batchEmbedContents') || urlString.includes('embeddings') || urlString.includes('embed')) {
        let numEmbeddings = 1;
        if (options && options.body) {
          try {
            const parsedBody = JSON.parse(options.body);
            if (parsedBody.requests) {
              numEmbeddings = parsedBody.requests.length;
            } else if (parsedBody.input) {
              numEmbeddings = Array.isArray(parsedBody.input) ? parsedBody.input.length : 1;
            }
          } catch (e) {}
        }
        const embeddings = Array(numEmbeddings).fill(0).map(() => ({
          values: Array(768).fill(0.01)
        }));
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            embeddings,
            data: embeddings.map((emb, idx) => ({
              embedding: emb.values,
              index: idx
            }))
          })
        };
      }
      return originalFetchInTest(url, options);
    };

    await createDummyPDF(dummyPath, 'Alice Cooper\nEmail: alice.cooper@example.com\nSkills: React, Node.js');
  });

  afterAll(() => {
    if (fs.existsSync(dummyPath)) {
      fs.unlinkSync(dummyPath);
    }
    delete URL.createObjectURL;
    delete URL.revokeObjectURL;
    delete globalThis.document;
    if (originalFetchInTest) {
      globalThis.fetch = originalFetchInTest;
    }
  });

  test('1. Exporting works properly under different stage selection combinations', () => {
    const headers = {
      name: 'Name',
      email: 'Email',
      stage: 'Current Stage'
    };
    const candidates = [
      { name: 'John Doe', email: 'john@example.com', stage: 'Inbox' },
      { name: 'Jane Smith', email: 'jane@example.com', stage: 'Shortlist' },
      { name: 'Bob Johnson', email: 'bob@example.com', stage: 'Interview' }
    ];

    // Scenario A: Exporting when all stages are included
    let csvRowsResult = [];
    const originalBlob = globalThis.Blob;
    globalThis.Blob = class {
      constructor(content, options) {
        csvRowsResult = content;
      }
    };

    // Filter candidates for selected stages: Inbox, Shortlist, Interview
    const selectedStages = ['Inbox', 'Shortlist', 'Interview'];
    const filtered = candidates.filter(c => selectedStages.some(s => s.toLowerCase() === c.stage.toLowerCase()));
    expect(filtered.length).toBe(3);

    exportToCSV(filtered, 'all_stages', headers);
    expect(csvRowsResult.length).toBe(1); // One item in array with BOM and CSV content
    expect(csvRowsResult[0]).toContain('John Doe');
    expect(csvRowsResult[0]).toContain('Jane Smith');
    expect(csvRowsResult[0]).toContain('Bob Johnson');

    // Scenario B: Exporting a subset of stages (e.g. only Shortlist)
    const selectedStagesSubset = ['Shortlist'];
    const filteredSubset = candidates.filter(c => selectedStagesSubset.some(s => s.toLowerCase() === c.stage.toLowerCase()));
    expect(filteredSubset.length).toBe(1);

    exportToCSV(filteredSubset, 'subset_stages', headers);
    expect(csvRowsResult[0]).not.toContain('John Doe');
    expect(csvRowsResult[0]).toContain('Jane Smith');
    expect(csvRowsResult[0]).not.toContain('Bob Johnson');

    // Restore global Blob
    globalThis.Blob = originalBlob;
  });

  test('2. Identical stage transitions do not call the API or save candidate history', async () => {
    // First, upload a candidate to get a candidateId
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(dummyPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('resume', blob, 'dummy_enh.pdf');

    const resUpload = await fetch(`${API_URL}/candidates/upload`, {
      method: 'POST',
      body: formData
    });
    expect(resUpload.status).toBe(200);
    const uploadData = await resUpload.json();
    candidateId = uploadData.candidate.id;
    expect(candidateId).toBeDefined();

    // Verify initial stage is "Inbox"
    expect(uploadData.candidate.stage).toBe('Inbox');
    const initialHistoryLength = uploadData.candidate.history.length;

    // Transition 1: Change to a new stage "Screening" (this should update history)
    const resTransition1 = await fetch(`${API_URL}/candidates/${candidateId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'Screening' })
    });
    expect(resTransition1.status).toBe(200);
    const dataTransition1 = await resTransition1.json();
    expect(dataTransition1.stage).toBe('Screening');
    expect(dataTransition1.history.length).toBe(initialHistoryLength + 1);
    expect(dataTransition1.history[dataTransition1.history.length - 1].text).toContain('Moved from "Inbox" to "Screening"');

    // Transition 2: Change to the SAME stage "Screening" (identical transition)
    // The backend should return the candidate object directly without saving history or updating DB
    const resTransition2 = await fetch(`${API_URL}/candidates/${candidateId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'Screening' })
    });
    expect(resTransition2.status).toBe(200);
    const dataTransition2 = await resTransition2.json();
    expect(dataTransition2.stage).toBe('Screening');
    // History length must remain exactly the same as Transition 1 (no new entry saved)
    expect(dataTransition2.history.length).toBe(initialHistoryLength + 1);
  });

  test('3. Every parsed candidate contains exactly 14 HR questions, and the first 7 match the standardized cold-calling questions', async () => {
    // Upload candidate first (since database is cleared before each test)
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(dummyPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('resume', blob, 'dummy_enh.pdf');

    const resUpload = await fetch(`${API_URL}/candidates/upload`, {
      method: 'POST',
      body: formData
    });
    expect(resUpload.status).toBe(200);
    const uploadData = await resUpload.json();
    const currentCandidateId = uploadData.candidate.id;

    // Retrieve the candidate we just uploaded and look at its HR questions
    const res = await fetch(`${API_URL}/candidates`);
    expect(res.status).toBe(200);
    const list = await res.json();
    const candidate = list.find(c => c.id === currentCandidateId);
    expect(candidate).toBeDefined();

    const hrQs = candidate.hrQuestions;
    // Every candidate must have exactly 14 HR questions
    expect(hrQs).toBeInstanceOf(Array);
    expect(hrQs.length).toBe(14);

    // The first 7 match the standardized cold-calling questions:
    const expectedFirst7 = [
      "Are you looking for a job?",
      "How many years of experience do you have?",
      "What is the reason for your job change?",
      "What is your current CTC?",
      "What is your expected CTC?",
      "What is your notice period?",
      "Is your notice period negotiable? (If the notice period is 30, 60, or 90 days)"
    ];

    for (let i = 0; i < 7; i++) {
      expect(hrQs[i].question).toBe(expectedFirst7[i]);
    }
  });

  test('4. Pasting a Job Description in AI Search ranks candidates, returns match score, and tailored questions', async () => {
    // Upload candidate first to index in RAG
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(dummyPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('resume', blob, 'dummy_enh.pdf');

    const resUpload = await fetch(`${API_URL}/candidates/upload`, {
      method: 'POST',
      body: formData
    });
    expect(resUpload.status).toBe(200);

    // Wait a brief period for async RAG indexing to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Perform a search by job description via POST /api/rag/jd-search
    const searchBody = {
      jdTitle: "Senior Node.js Developer",
      jdRequirements: "React, Node.js, Express, MongoDB, 5+ years experience",
      jdDescription: "Develop scalable microservices and manage database queries using MongoDB."
    };

    const res = await fetch(`${API_URL}/rag/jd-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchBody)
    });
    expect(res.status).toBe(200);

    const candidatesResult = await res.json();
    expect(candidatesResult).toBeInstanceOf(Array);
    expect(candidatesResult.length).toBeGreaterThan(0);

    // Verify candidates are sorted by matchScore descending
    for (let i = 0; i < candidatesResult.length - 1; i++) {
      expect(candidatesResult[i].matchScore).toBeGreaterThanOrEqual(candidatesResult[i + 1].matchScore);
    }

    // Verify each candidate contains matchScore, matchingSkills, missingSkills, explanation
    const topCandidate = candidatesResult[0];
    expect(topCandidate).toHaveProperty('matchScore');
    expect(topCandidate.matchScore).toBeGreaterThanOrEqual(0);
    expect(topCandidate).toHaveProperty('matchingSkills');
    expect(topCandidate).toHaveProperty('missingSkills');
    expect(topCandidate).toHaveProperty('explanation');

    // Explicitly generate questions for the candidate according to the job description
    const resQ = await fetch(`${API_URL}/candidates/${topCandidate.id}/generate-jd-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchBody)
    });
    expect(resQ.status).toBe(200);

    const questions = await resQ.json();
    expect(questions).toHaveProperty('hrQuestions');
    expect(questions).toHaveProperty('technicalQuestions');
    expect(questions.hrQuestions.length).toBe(7); // Tailored HR questions (mapped with mapAnalysisToQuestions)
  });
});
