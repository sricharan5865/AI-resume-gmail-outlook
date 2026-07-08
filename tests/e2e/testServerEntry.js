// Set test environments
process.env.PORT = '5001';
process.env.MONGO_URI = 'mongodb://admin:password@localhost:27017/talentflow_test?authSource=admin';
process.env.AI_PROVIDER = 'gemini'; // Force to Gemini or whatever to hit the mock
process.env.NODE_ENV = 'test';

// Mock global fetch to intercept outgoing LLM calls
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const urlString = typeof url === 'object' ? (url.url || url.toString()) : url;
  console.log(`[TEST HARNESS FETCH] url type: ${typeof url}, urlString: "${urlString}"`);
  
  if (urlString.includes('openrouter.ai') || urlString.includes('generativelanguage.googleapis.com')) {
    let body = {};
    if (options && options.body) {
      try {
        body = JSON.parse(options.body);
      } catch (e) {}
    }

    // Intercept embeddings request to return mock embedding vectors
    if (urlString.includes('batchEmbedContents') || urlString.includes('embeddings') || urlString.includes('embed')) {
      console.log(`[TEST HARNESS FETCH] Intercepted embeddings request: ${urlString}`);
      let numEmbeddings = 1;
      if (body.requests) {
        numEmbeddings = body.requests.length;
      } else if (body.input) {
        numEmbeddings = Array.isArray(body.input) ? body.input.length : 1;
      }
      const embeddings = Array(numEmbeddings).fill(0).map(() => ({
        values: Array(768).fill(0.01)
      }));
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name) => {
            if (name.toLowerCase() === 'content-type') return 'application/json';
            return null;
          }
        },
        json: async () => ({
          embeddings,
          data: embeddings.map((emb, idx) => ({
            embedding: emb.values,
            index: idx
          }))
        })
      };
    }

    let promptText = '';
    if (body.messages && body.messages.length > 0) {
      promptText = body.messages[body.messages.length - 1].content || '';
    } else if (body.contents && body.contents[0] && body.contents[0].parts && body.contents[0].parts[0]) {
      promptText = body.contents[0].parts[0].text || '';
    }

    let candidateName = "Test Candidate";
    let candidateEmail = "test@example.com";
    if (promptText) {
      const emailMatch = promptText.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
      if (emailMatch) {
        candidateEmail = emailMatch[1];
        const lines = promptText.split('\n');
        for (const line of lines) {
          if (line.includes('Email:')) {
            const idx = lines.indexOf(line);
            if (idx > 0 && lines[idx - 1].trim()) {
              candidateName = lines[idx - 1].trim();
            }
            break;
          }
        }
      }
    }

    // Try to extract from global state
    if (global.lastUploadedFilename) {
      if (global.lastUploadedFilename.toLowerCase().includes('alice')) {
        candidateName = 'Alice';
        candidateEmail = 'alice@example.com';
      } else if (global.lastUploadedFilename.toLowerCase().includes('bob')) {
        candidateName = 'Bob';
        candidateEmail = 'bob@example.com';
      } else if (global.lastUploadedFilename.toLowerCase().includes('john')) {
        candidateName = 'John Doe';
        candidateEmail = 'john@example.com';
      }
    } else {
      // Try to extract from pdfBase64
      let pdfBase64 = null;
      if (body.contents && body.contents[0] && body.contents[0].parts) {
        const part = body.contents[0].parts.find(p => p.inlineData && p.inlineData.data);
        if (part) {
          pdfBase64 = part.inlineData.data;
        }
      }
      if (pdfBase64) {
        const decoded = Buffer.from(pdfBase64, 'base64').toString('utf-8');
        if (decoded.includes('Alice')) {
          candidateName = 'Alice';
          candidateEmail = 'alice@example.com';
        } else if (decoded.includes('Bob')) {
          candidateName = 'Bob';
          candidateEmail = 'bob@example.com';
        } else if (decoded.includes('John Doe')) {
          candidateName = 'John Doe';
          candidateEmail = 'john@example.com';
        }
      }
    }

    // Default mock response structure for resume parsing and Q&As
    let parsedResponse = {
      name: candidateName,
      email: candidateEmail,
      phone: "123-456-7890",
      linkedinUrl: "https://linkedin.com/in/test",
      skills: ["JavaScript", "HTML", "CSS"],
      experience: [{ role: "Software Engineer", company: "Test Co", duration: "2 years", description: "Coding" }],
      education: [{ degree: "BS CS", institution: "Test U", year: "2022" }],
      seniorityLevel: "Mid",
      hrQuestions: [
        { question: "Tell me about yourself.", answer: "Sample HR answer 1." },
        { question: "Why do you want this job?", answer: "Sample HR answer 2." },
        { question: "What are your strengths?", answer: "Sample HR answer 3." },
        { question: "What are your weaknesses?", answer: "Sample HR answer 4." },
        { question: "Where do you see yourself in 5 years?", answer: "Sample HR answer 5." }
      ],
      technicalQuestions: [
        { question: "Explain closures in JS.", answer: "Sample Tech answer 1." },
        { question: "What is promise?", answer: "Sample Tech answer 2." },
        { question: "What is event loop?", answer: "Sample Tech answer 3." },
        { question: "What is prototypal inheritance?", answer: "Sample Tech answer 4." },
        { question: "What is virtual DOM?", answer: "Sample Tech answer 5." }
      ]
    };

    // If generating tags
    if (urlString.includes('completions') || urlString.includes('generate')) {
      if (body.messages && body.messages.some(m => m.content && m.content.toLowerCase().includes('tag'))) {
        parsedResponse = [
          { value: "JavaScript", category: "Technical", confidence: 0.9 },
          { value: "Mid Level", category: "Experience", confidence: 0.8 }
        ];
      } else if (body.messages && body.messages.some(m => m.content && m.content.toLowerCase().includes('job description'))) {
        parsedResponse = {
          description: "Mock Job Description",
          requirements: "Mock Requirements"
        };
      }
    }

    const responseContent = JSON.stringify(parsedResponse);
    
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: responseContent
          }
        }],
        candidates: [{
          content: {
            parts: [{
              text: responseContent
            }]
          }
        }]
      })
    };
  }

  return originalFetch(url, options);
};

// Start the server
console.log('Starting server under E2E mock harness...');
await import('../../server/server.js');
