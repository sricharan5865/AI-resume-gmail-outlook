# Handoff Report - JD-Search RAG Endpoint Audit and Design

## 1. Observation

During my investigation of the server codebase, I observed the following files and functions:

### Vector Search in `server/ragService.js` (lines 276-363)
```javascript
export async function searchResumes(query, topK = 10, jobId = null) {
  const startTime = Date.now();

  if (vectorIndex.length === 0) {
    return { results: [], queryTimeMs: Date.now() - startTime, totalChunksSearched: 0 };
  }

  // Embed the query
  const queryEmbedding = await embedQuery(query);

  // Compute cosine similarity against all vectors
  let scoredChunks = vectorIndex.map(entry => ({
    ...entry,
    score: cosineSimilarity(queryEmbedding, entry.embedding)
  }));

  // Filter by jobId if provided
  if (jobId) {
    // Get candidateIds that belong to this job
    const jobCandidates = await Candidate.find({ jobId }, { id: 1 }).lean();
    const jobCandidateIds = new Set(jobCandidates.map(c => c.id));
    scoredChunks = scoredChunks.filter(c => jobCandidateIds.has(c.candidateId));
  }

  // Group by candidateId: collect all matching sections, keep best score per candidate
  const candidateMap = new Map();
  for (const chunk of scoredChunks) {
    if (!candidateMap.has(chunk.candidateId)) {
      candidateMap.set(chunk.candidateId, {
        candidateId: chunk.candidateId,
        bestScore: chunk.score,
        matchedSections: []
      });
    }

    const entry = candidateMap.get(chunk.candidateId);
    if (chunk.score > entry.bestScore) {
      entry.bestScore = chunk.score;
    }
    // Only include sections with reasonable relevance
    if (chunk.score > 0.3) {
      entry.matchedSections.push({
        section: chunk.section,
        text: chunk.text,
        score: Math.round(chunk.score * 1000) / 1000
      });
    }
  }

  // Sort by best score descending and take topK
  const topCandidates = Array.from(candidateMap.values())
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, topK);
  ...
```

### Candidate Scoring in `server/geminiParser.js` (lines 1118-1158)
```javascript
export async function scoreCandidate(candidateProfile, jobDescription) {
  const systemInstruction = 'You are a professional HR screener and hiring manager. Evaluate the candidate against the job description. Extract and compare the required job qualifications and skills exactly. DO NOT hallucinate or assume the candidate has skills, degrees, or experience not explicitly stated in their resume. Ground all matching and missing qualifications strictly in the provided text inputs.';

  const schema = {
    type: 'OBJECT',
    properties: {
      score: { 
        type: 'INTEGER', 
        description: 'Match score between 0 and 100 indicating fit. Be highly realistic and strict: matching all requirements is 95+, partial is 50-70, poor is <50.' 
      },
      matchingSkills: { 
        type: 'ARRAY', 
        items: { type: 'STRING' },
        description: 'Skills, tools, or qualifications explicitly present in the candidate profile that match the job description. Do not assume or hallucinate.'
      },
      missingSkills: { 
        type: 'ARRAY', 
        items: { type: 'STRING' },
        description: 'Required skills, tools, certifications, degrees, or qualifications mentioned in the job description that the candidate lacks or does not have. Do not assume or hallucinate.'
      },
      reasoning: { 
        type: 'STRING', 
        description: 'A 2-sentence professional explanation of why the candidate was given this score, referencing specific matching and missing qualifications.'
      }
    },
    required: ['score', 'matchingSkills', 'missingSkills', 'reasoning']
  };

  const prompt = `
Candidate Profile:
${JSON.stringify(candidateProfile, null, 2)}

Job Description:
Title: ${jobDescription.title}
Requirements: ${jobDescription.requirements}
Description: ${jobDescription.description}

Evaluate this candidate for the job strictly. Compare all required qualifications (skills, experience level, tools) and list matches and gaps without any hallucinations:`;

  return await callAIProvider(prompt, systemInstruction, schema);
}
```

### Questions Generation in `server/geminiParser.js` (lines 1282-1397)
```javascript
export async function generateQuestionsForCandidate(candidateProfile, jobDescription = null) {
  let settings = null;
  try {
    settings = await Settings.findById('global');
  } catch (e) {}
  const aiProvider = settings?.aiProvider || 'gemini';

  const systemInstruction = getRecruiterSystemInstruction(aiProvider);

  const schema = {
    type: 'OBJECT',
    properties: {
      career_gaps: { ... },
      technical_depth_audit: { ... },
      domain_question_bank: { ... },
      project_deep_dive: { ... },
      hr_questions: { ... },
      red_flags: { ... },
      must_prepare_topics: { ... },
      fit_summary: { ... }
    },
    required: [...]
  };

  const prompt = `
Candidate Profile:
${JSON.stringify(candidateProfile, null, 2)}

${jobDescription ? `Job Description:\nTitle: ${jobDescription.title}\nRequirements: ${jobDescription.requirements}\nDescription: ${jobDescription.description}` : 'Job Description: None (General Role)'}

Perform the technical recruiter seven-part analysis on this candidate:`;

  const parsedData = await callAIProvider(prompt, systemInstruction, schema);
  mapAnalysisToQuestions(parsedData);
  return parsedData;
}
```

### Models definition in `server/models.js`
- `Candidate` contains `id`, `name`, `email`, `phone`, `skills`, `experience`, `education`, etc. (lines 3-77).
- `Job` contains `id`, `title`, `department`, `location`, `description`, `requirements` (lines 82-96).
- `ResumeChunk` represents semantic fragments of a resume with fields `chunkId`, `candidateId`, `section`, `text`, and `embedding` (lines 151-173).

---

## 2. Logic Chain

1. **Vector Search Audit**:
   - `searchResumes()` relies on an in-memory `vectorIndex` array populated at start-up from the MongoDB `ResumeChunk` collection.
   - When executing `searchResumes(query, topK, jobId)`:
     - It embeds the query text using `embedQuery(query)`.
     - It maps over the in-memory array and computes `cosineSimilarity(queryEmbedding, entry.embedding)` for each chunk.
     - If `jobId` is provided, it query `Candidate` collection to filter candidates matching the ID, keeping only their chunks.
     - It aggregates chunks by candidate ID, picking the maximum chunk score as the overall candidate match score, filters out sections with score <= 0.3, and returns the top `topK` candidates after fetching their complete records from MongoDB.
     - **Implication**: If we query using a Job Description, we can embed the JD title and requirements (or description) as a natural language search query. This will retrieve candidates with the most semantically relevant resume chunks.

2. **Scoring Model Audit**:
   - `scoreCandidate(candidateProfile, jobDescription)` takes a parsed candidate object and a `jobDescription` containing `{ title, requirements, description }`.
   - It prompts the LLM to output a JSON object containing a strict, non-hallucinated score, matching skills, missing skills, and reasoning.
   - **Implication**: This function can be reused directly to score each candidate retrieved from the vector search phase against the search job description.

3. **Questions Generation Audit**:
   - `generateQuestionsForCandidate(candidateProfile, jobDescription)` performs a full 7-part analysis on the candidate relative to the provided `jobDescription`.
   - The raw response is processed by `mapAnalysisToQuestions()`, which populates `parsedData.hrQuestions` and `parsedData.technicalQuestions` with exactly 7 questions each.
   - **Implication**: This function is directly reusable to obtain highly customized, JD-tailored questions for candidates.

4. **Design of `POST /api/rag/jd-search`**:
   - We need to combine vector search, candidate scoring, and question generation.
   - **Input Payload**: The endpoint should accept `jobId` (to look up an existing job) and/or `jobDescription` (raw string or structured object), and optional parameters `topK` (RAG retrieval count) and `limitScore` (number of top results to pass to the LLM).
   - **Performance Considerations**: Evaluating each candidate requires two LLM calls (`scoreCandidate` and `generateQuestionsForCandidate`). If `topK` is large (e.g. 10), calling these APIs in parallel for all 10 candidates will make 20 simultaneous LLM calls, risking timeout and rate limits. Therefore, we should:
     - Fetch the top `topK` candidates via vector search (cheap, fast, in-memory).
     - Filter/slice down to a smaller count `limitScore` (e.g., top 3-5 candidates) for LLM processing.
     - Process candidate scoring and QnA generation in parallel using concurrency limits or controlled batching, ensuring robust error catch blocks that fallback to standard questions/scores rather than failing the entire request.
     - Dynamically return the scored and annotated results in the HTTP response without mutating the candidate's permanent database state (since candidate records may correspond to other assigned jobs).

---

## 3. Caveats

- **In-Memory Scale**: The vector search relies on an in-memory `vectorIndex` array. If candidate database sizes scale to tens of thousands, this simple array map-similarity will become a memory bottleneck.
- **LLM Latency & Cost**: Performing LLM scoring and question generation for multiple candidates in a single API request is slow (~5-15 seconds depending on AI provider, and significantly longer on local Ollama endpoints). A strict limit on LLM evaluations per search request (e.g. max 3-5 candidates) is recommended.

---

## 4. Conclusion

The server architecture provides all the necessary components for building a robust `POST /api/rag/jd-search` endpoint. We can leverage:
1. `searchResumes()` in `server/ragService.js` for initial fast semantic candidate retrieval.
2. `scoreCandidate()` in `server/geminiParser.js` for LLM-based strict match scoring and skill gap analysis.
3. `generateQuestionsForCandidate()` in `server/geminiParser.js` for custom JD-tailored behavioral and technical interview questions.

### Recommended Endpoint Specification: `POST /api/rag/jd-search`

#### Request Schema
```json
{
  "jobId": "job-123", // Optional: to fetch JD from MongoDB
  "jobDescription": { // Optional: override or raw JD definition
    "title": "Senior Frontend Developer",
    "requirements": "React, TypeScript, Redux, 5+ years experience",
    "description": "Building next-generation recruiter dashboard interfaces."
  }, // Can also be a plain string
  "topK": 10,        // Optional: number of RAG vector search results (default: 10)
  "limitScore": 3    // Optional: number of top candidates to evaluate with LLM (default: 3)
}
```

#### Route Implementation Outline
```javascript
app.post('/api/rag/jd-search', authenticateToken, async (req, res) => {
  try {
    const { jobId, jobDescription, topK = 10, limitScore = 3 } = req.body;

    let jobObj = null;
    if (jobId) {
      const jobDoc = await Job.findOne({ id: jobId });
      if (jobDoc) {
        jobObj = {
          title: jobDoc.title,
          requirements: jobDoc.requirements || '',
          description: jobDoc.description || ''
        };
      }
    }

    if (!jobObj && jobDescription) {
      if (typeof jobDescription === 'string') {
        jobObj = {
          title: 'JD Search Role',
          requirements: jobDescription,
          description: jobDescription
        };
      } else if (typeof jobDescription === 'object') {
        jobObj = {
          title: jobDescription.title || 'JD Search Role',
          requirements: jobDescription.requirements || '',
          description: jobDescription.description || ''
        };
      }
    }

    if (!jobObj) {
      return res.status(400).json({ error: 'Valid jobId or jobDescription is required.' });
    }

    // Step 1: Form search query from JD title and requirements
    const searchQuery = `${jobObj.title} ${jobObj.requirements}`.trim();
    const searchResult = await searchResumes(searchQuery, topK);

    if (searchResult.results.length === 0) {
      return res.json({ results: [] });
    }

    // Step 2: Slice to top candidate results to limit LLM execution
    const candidatesToScore = searchResult.results.slice(0, Math.min(limitScore, searchResult.results.length));

    // Step 3: Run LLM scoring and question generation
    const scoredPromises = candidatesToScore.map(async (candidateResult) => {
      try {
        const candidateDoc = await Candidate.findOne({ id: candidateResult.candidateId }).lean();
        if (!candidateDoc) return null;

        // Perform parallel LLM operations per candidate
        const [scoreResult, qnaResult] = await Promise.all([
          scoreCandidate(candidateDoc, jobObj).catch(err => {
            console.error(`Scoring failed for ${candidateDoc.id}:`, err.message);
            return { score: 0, matchingSkills: [], missingSkills: [], reasoning: 'AI scoring failed.' };
          }),
          generateQuestionsForCandidate(candidateDoc, jobObj).catch(err => {
            console.error(`QnA generation failed for ${candidateDoc.id}:`, err.message);
            return { hrQuestions: [], technicalQuestions: [] };
          })
        ]);

        return {
          candidateId: candidateDoc.id,
          name: candidateDoc.name,
          email: candidateDoc.email,
          skills: candidateDoc.skills,
          seniorityLevel: candidateDoc.seniorityLevel,
          resumeUrl: candidateDoc.resumeUrl,
          stage: candidateDoc.stage,
          vectorRelevanceScore: candidateResult.relevanceScore,
          llmMatchScore: scoreResult.score || 0,
          matchingSkills: scoreResult.matchingSkills || [],
          missingSkills: scoreResult.missingSkills || [],
          reasoning: scoreResult.reasoning || '',
          hrQuestions: qnaResult.hrQuestions || [],
          technicalQuestions: qnaResult.technicalQuestions || []
        };
      } catch (err) {
        console.error(`Error processing candidate ${candidateResult.candidateId}:`, err);
        return null;
      }
    });

    const scoredCandidates = (await Promise.all(scoredPromises)).filter(Boolean);

    // Step 4: Sort by LLM Match Score descending
    scoredCandidates.sort((a, b) => b.llmMatchScore - a.llmMatchScore);

    res.json({
      results: scoredCandidates,
      totalFound: searchResult.results.length,
      scoredCount: scoredCandidates.length
    });

  } catch (error) {
    console.error('JD RAG search error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

## 5. Verification Method

To verify the proposed design:
1. **Mock Test**: Create a temporary integration test inside `tests/` folder checking the endpoint return format when mock candidate records exist.
2. **Schema and Types Check**: Verify that the returned object contains all required properties like `llmMatchScore`, `matchingSkills`, `missingSkills`, `reasoning`, `hrQuestions`, and `technicalQuestions`.
3. **Execution Command**:
   - Run Vitest endpoint tests locally to verify server functions: `npx vitest tests/e2e/regenerateQuestions.test.js` (to confirm the underlying Q&A generator functions correctly).
