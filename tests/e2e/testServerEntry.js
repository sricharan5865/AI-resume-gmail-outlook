// Set test environments
process.env.PORT = '5001';
process.env.MONGO_URI = 'mongodb://admin:password@localhost:27017/talentflow_test?authSource=admin';
process.env.AI_PROVIDER = 'gemini'; // Force to Gemini or whatever to hit the mock

// Mock global fetch to intercept outgoing LLM calls
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const urlString = typeof url === 'object' ? url.toString() : url;
  
  if (urlString.includes('openrouter.ai') || urlString.includes('generativelanguage.googleapis.com')) {
    let body = {};
    if (options && options.body) {
      try {
        body = JSON.parse(options.body);
      } catch (e) {}
    }

    // Default mock response structure for resume parsing and Q&As
    let parsedResponse = {
      name: "Test Candidate",
      email: "test@example.com",
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
