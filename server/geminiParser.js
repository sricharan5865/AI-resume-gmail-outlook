import dotenv from 'dotenv';
import { Settings } from './models.js';
dotenv.config();

function cleanJsonResponse(text) {
  let clean = text.trim();
  if (clean.startsWith('```json')) {
    clean = clean.substring(7);
  } else if (clean.startsWith('```')) {
    clean = clean.substring(3);
  }
  if (clean.endsWith('```')) {
    clean = clean.substring(0, clean.length - 3);
  }
  return clean.trim();
}

function safeParseJson(text, cleanedText) {
  try {
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('GeminiParser: JSON parsing failed.');
    console.error('Raw response text:', text);
    console.error('Cleaned text tried to parse:', cleanedText);
    throw error;
  }
}

/**
 * Helper to call the configured AI Provider via direct HTTP POST.
 */
async function callAIProvider(prompt, systemInstruction = '', schema = null) {
  let settings = null;
  try {
    settings = await Settings.findById('global');
  } catch (e) {
    console.error('Failed to retrieve settings from DB, using fallback env variables:', e.message);
  }

  const aiProvider = settings?.aiProvider || 'gemini';
  
  if (aiProvider === 'gemini') {
    const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key is not configured.');
    }

    const isOpenRouter = apiKey.startsWith('sk-or-');

    if (isOpenRouter) {
      const url = 'https://openrouter.ai/api/v1/chat/completions';
      const requestBody = {
        model: process.env.AI_MODEL || 'google/gemini-2.5-flash',
        max_tokens: 8192,
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          { role: 'user', content: prompt }
        ]
      };

      if (schema) {
        requestBody.response_format = { type: 'json_object' };
        requestBody.messages.push({
          role: 'user',
          content: `Output MUST match JSON schema: ${JSON.stringify(schema)}`
        });
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini AI API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const text = result.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('Gemini AI API returned an empty response.');
      }

      const cleanedText = cleanJsonResponse(text);
      return schema ? safeParseJson(text, cleanedText) : cleanedText;
    } else {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

      const requestBody = {
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1
        }
      };

      if (systemInstruction) {
        requestBody.systemInstruction = {
          parts: [{ text: systemInstruction }]
        };
      }

      if (schema) {
        requestBody.generationConfig.responseMimeType = 'application/json';
        requestBody.generationConfig.responseSchema = schema;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Gemini API returned an empty response.');
      }

      return schema ? safeParseJson(text, text) : text;
    }
  } else if (aiProvider === 'openai') {
    const apiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured.');
    }

    const isOpenRouter = apiKey.startsWith('sk-or-');
    const url = isOpenRouter ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
    
    const userContent = schema 
      ? `${prompt}\n\nOutput MUST be valid JSON matching the schema: ${JSON.stringify(schema)}\nDo not include any chat prefix or suffix. Return ONLY the raw JSON object.` 
      : prompt;

    const requestBody = {
      model: isOpenRouter ? 'openai/gpt-4o-mini' : 'gpt-4o-mini',
      messages: [
        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
        { role: 'user', content: userContent }
      ],
      temperature: 0.1,
      max_tokens: 8192
    };

    if (schema) {
      requestBody.response_format = { type: 'json_object' };
      if (isOpenRouter) {
        requestBody.messages.push({
          role: 'user',
          content: `Output MUST match JSON schema: ${JSON.stringify(schema)}`
        });
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('OpenAI API returned an empty response.');
    }

    const cleanedText = cleanJsonResponse(text);
    return schema ? safeParseJson(text, cleanedText) : cleanedText;
  } else if (aiProvider === 'claude') {
    const apiKey = settings?.claudeApiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Claude API key is not configured.');
    }

    const isOpenRouter = apiKey.startsWith('sk-or-');
    const url = isOpenRouter ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.anthropic.com/v1/messages';
    const userContent = schema 
      ? `${prompt}\n\nOutput MUST be valid JSON matching the schema: ${JSON.stringify(schema)}\nDo not include any chat prefix or suffix. Return ONLY the raw JSON object.` 
      : prompt;

    let response;
    if (isOpenRouter) {
      const requestBody = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          { role: 'user', content: userContent }
        ],
        temperature: 0.1,
        max_tokens: 8000
      };

      if (schema) {
        requestBody.response_format = { type: 'json_object' };
        requestBody.messages.push({
          role: 'user',
          content: `Output MUST match JSON schema: ${JSON.stringify(schema)}`
        });
      }

      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude (OpenRouter) API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const text = result.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('Claude (OpenRouter) API returned an empty response.');
      }

      const cleanedText = cleanJsonResponse(text);
      return schema ? safeParseJson(text, cleanedText) : cleanedText;

    } else {
      const requestBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 8000,
        system: systemInstruction || undefined,
        messages: [
          { role: 'user', content: userContent }
        ],
        temperature: 0.1
      };

      response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const text = result.content?.[0]?.text;
      if (!text) {
        throw new Error('Claude API returned an empty response.');
      }

      const cleanedText = cleanJsonResponse(text);
      return schema ? safeParseJson(text, cleanedText) : cleanedText;
    }
  } else if (aiProvider === 'ollama') {
    const ollamaUrl = settings?.ollamaUrl || 'http://localhost:11434';
    const model = settings?.ollamaModel || 'llama3';

    const url = `${ollamaUrl.replace(/\/$/, '')}/api/chat`;
    const userContent = schema 
      ? `${prompt}\n\nOutput MUST be valid JSON matching the schema: ${JSON.stringify(schema)}\nDo not include any chat prefix or suffix. Return ONLY the raw JSON object.` 
      : prompt;

    const requestBody = {
      model: model,
      messages: [
        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
        { role: 'user', content: userContent }
      ],
      stream: false,
      options: {
        temperature: 0.1
      }
    };

    if (schema) {
      requestBody.format = 'json';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const text = result.message?.content;
    if (!text) {
      throw new Error('Ollama API returned an empty response.');
    }

    const cleanedText = cleanJsonResponse(text);
    return schema ? safeParseJson(text, cleanedText) : cleanedText;
  } else {
    throw new Error(`Unsupported AI Provider: ${aiProvider}`);
  }
}

function mapAnalysisToQuestions(parsedData) {
  const hrQuestions = [];
  const technicalQuestions = [];

  // 1. Map Career Gaps to HR
  if (parsedData.career_gaps && Array.isArray(parsedData.career_gaps)) {
    parsedData.career_gaps.forEach(gap => {
      if (gap.interview_question && gap.sample_answer) {
        hrQuestions.push({
          question: gap.interview_question,
          answer: gap.sample_answer
        });
      }
    });
  }

  // 2. Map HR Questions to HR
  if (parsedData.hr_questions && Array.isArray(parsedData.hr_questions)) {
    parsedData.hr_questions.forEach(q => {
      if (q.question && q.sample_answer) {
        hrQuestions.push({
          question: q.question,
          answer: q.sample_answer
        });
      }
    });
  }

  // 3. Map Technical Depth Audit to Technical
  if (parsedData.technical_depth_audit && Array.isArray(parsedData.technical_depth_audit)) {
    parsedData.technical_depth_audit.forEach(audit => {
      if (!audit.has_depth && audit.probing_question && audit.answer_template) {
        technicalQuestions.push({
          question: audit.probing_question,
          answer: audit.answer_template
        });
      }
    });
  }

  // 4. Map Domain Question Bank to Technical
  if (parsedData.domain_question_bank && Array.isArray(parsedData.domain_question_bank)) {
    parsedData.domain_question_bank.forEach(q => {
      if (q.question && q.model_answer) {
        technicalQuestions.push({
          question: q.question,
          answer: q.model_answer
        });
      }
    });
  }

  // 5. Map Project Deep-Dive to Technical
  if (parsedData.project_deep_dive && Array.isArray(parsedData.project_deep_dive)) {
    parsedData.project_deep_dive.forEach(proj => {
      if (proj.follow_up_questions && Array.isArray(proj.follow_up_questions)) {
        proj.follow_up_questions.forEach(q => {
          if (q.question && q.model_answer) {
            technicalQuestions.push({
              question: q.question,
              answer: q.model_answer
            });
          }
        });
      }
    });
  }

  // Fallback: Ensure at least 5 questions exist for both
  if (hrQuestions.length < 5) {
    if (parsedData.interviewQuestions && Array.isArray(parsedData.interviewQuestions)) {
      parsedData.interviewQuestions.forEach(q => {
        if (hrQuestions.length < 5) {
          hrQuestions.push({ question: q, answer: "No sample answer available." });
        }
      });
    }
    while (hrQuestions.length < 5) {
      hrQuestions.push({ question: `Tell me about your background and how it prepares you for this role?`, answer: "I have a solid foundation in software development and have successfully delivered projects in my previous roles." });
    }
  }

  if (technicalQuestions.length < 5) {
    while (technicalQuestions.length < 5) {
      technicalQuestions.push({ question: `What is your technical stack and how do you decide which technology to use?`, answer: "I prioritize technology based on scalability, maintainability, team familiarity, and the specific needs of the project." });
    }
  }

  parsedData.hrQuestions = hrQuestions;
  parsedData.technicalQuestions = technicalQuestions;
}

/**
 * Parses resume text into structured JSON format.
 */
export async function parseResume(resumeText) {
  if (!resumeText || resumeText.trim().length === 0) {
    throw new Error('Failed to extract text from PDF. The resume might be an image or a scanned document.');
  }

  const systemInstruction = `You are a senior technical recruiter and hiring-panel interviewer. You have spent years interviewing candidates across multiple domains and you are known for catching exactly the things a resume tries to gloss over. When given a resume, you produce a detailed, structured analysis — never a generic summary. You ground every observation in specific facts from the resume (exact dates, company names, tools, numbers). You never invent facts that are not in the resume; if something is unclear, say so and ask about it.

Run the following seven-part analysis on every resume, in order.

### 1. Career Timeline & Gap Analysis
- Reconstruct the candidate's full timeline: education end dates, every job's start/end date, and any stated career breaks.
- Flag any gap of 2+ months between two consecutive entries (job-to-job, or education-to-first-job).
- For each gap, output: the exact date range, its length, one direct interview question the candidate should expect (e.g. "Can you walk me through what you were doing between [Month Year] and [Month Year]?"), and a sample answer the candidate could give — framed around plausible, positive explanations (upskilling, freelance work, family/health reasons, job search) rather than inventing a specific real reason you don't know.
- If there are no gaps, state that explicitly — don't invent one.

### 2. Technical Depth Audit
- List every tool, technology, platform, or skill the resume names.
- For each one, judge whether it's backed by specifics (versions, named sub-components/services, scale, or outcome) or just name-dropped with no detail.
- For every skill that's name-dropped without depth, write one targeted question that would force the candidate to prove real hands-on experience (e.g. "You list AWS — which specific services did you use, and for what?"), plus a short answer template showing what a strong, specific answer should cover so the candidate knows how to fill in their own real details.
- Do not flag a skill as shallow if the resume already gives a concrete example of its use.

### 3. Domain Knowledge Question Bank
- Identify the candidate's primary domain/specialty from their skills and job titles.
- Generate 8–15 domain concept questions a panel would realistically ask someone at this candidate's seniority level, ordered from fundamental to advanced.
- Provide a model answer (2–4 sentences) for each question, written the way a strong candidate would actually answer — not textbook definitions.
- Calibrate difficulty to the candidate's years of experience: a 2-year candidate gets foundational questions; an 8-year candidate gets architecture/trade-off questions.

### 4. Project & Achievement Deep-Dive
- For each project or major responsibility listed, write one or two "prove it" follow-up questions that target the specific claim made (especially any number, percentage, or outcome stated), each with a model answer showing how a candidate who genuinely did the work would answer (referencing the method, tools, and result) — written from the resume's own details, not invented specifics beyond what's plausible.
- Prioritize claims that sound impressive but are unsupported (e.g. a stated accuracy percentage, a scale claim, a "led the team" claim) — these get the most scrutiny.

### 5. HR & Behavioral Readiness
- Generate the standard HR question set, personalized with the candidate's actual details where possible: tell me about yourself; reason for leaving current/most recent company (use the actual company name); reason for seeking a new role; current vs. expected compensation; why should we hire you; key strengths; 5-year vision; reason for any job change pattern observed.
- For each question, give a sample answer built from the candidate's actual resume facts (companies, titles, skills, tenure) wherever possible. Where the real reason isn't knowable (e.g. why they're leaving), give a professional, plausible answer rather than a fabricated specific reason.
- If question 1 already surfaced a gap, reuse that gap's specific dates here too instead of a generic gap question.

### 6. Resume Red Flags & Quality Check
- Call out concrete quality issues only if actually present, such as: missing company names, missing certifications relevant to the field, no quantified outcomes anywhere, inconsistent or ambiguous dates, very short tenures without explanation, or skills listed with zero supporting context anywhere in the document.
- Mark each flag with a severity (minor / moderate / major) and a one-line fix suggestion.

### 7. Must-Prepare Topics & Fit Summary
- Produce a checklist of 6–10 core topics this candidate should be ready to go deep on, derived from their actual listed skills (not a generic list for the field in general).
- Close with a 2–3 sentence "why hire" pitch written in the candidate's own voice, using only facts present in the resume — this is what a well-prepared candidate could say in response to "why should we hire you."

CRITICAL FOR LINKEDIN URL: The input text is from an OCR engine and may contain a two-column layout, meaning lines are read horizontally across columns. A LinkedIn URL like "wwwiinkedin.com/in/jayav" might be broken into multiple lines and split by other text (e.g., "arapu-sri-charan-" and "43273137b" appearing later). You MUST find all parts of the split LinkedIn URL, merge them, correct any OCR typos (such as "iinkedin" -> "linkedin"), and output the full correct URL (e.g. "https://www.linkedin.com/in/jayavarapu-sri-charan-43273137b").`;
  
  const schema = {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING', description: 'Full name of the candidate' },
      email: { type: 'STRING', description: 'Primary email address' },
      phone: { type: 'STRING', description: 'Phone number' },
      linkedinUrl: { 
        type: 'STRING', 
        description: 'Reconstructed and corrected full LinkedIn profile URL (e.g. https://www.linkedin.com/in/jayavarapu-sri-charan-43273137b). Correct OCR typos like "iinkedin" to "linkedin". Return empty string if not present.' 
      },
      skills: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'List of skills, programming languages, technologies, or soft skills'
      },
      experience: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            role: { type: 'STRING', description: 'Job title' },
            company: { type: 'STRING', description: 'Company name' },
            duration: { type: 'STRING', description: 'Duration of employment (e.g. Jan 2021 - Dec 2023)' },
            description: { type: 'STRING', description: 'Brief description of duties' }
          },
          required: ['role', 'company', 'duration']
        }
      },
      education: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            degree: { type: 'STRING', description: 'Degree received (e.g., Bachelor of Computer Science)' },
            institution: { type: 'STRING', description: 'University or College name' },
            year: { type: 'STRING', description: 'Year of graduation' }
          },
          required: ['degree', 'institution']
        }
      },
      seniorityLevel: {
        type: 'STRING',
        description: 'Determine the candidate\'s seniority level based on experience years and roles. Choose one of: Junior, Mid, Senior, Lead, Executive.'
      },
      interviewQuestions: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'A list of 4-5 tailored HR/behavioral/technical interview questions specific to this candidate\'s background, resume details, and determined seniority level.'
      },
      career_gaps: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            period: { type: 'STRING' },
            length: { type: 'STRING' },
            interview_question: { type: 'STRING' },
            sample_answer: { type: 'STRING' }
          },
          required: ['period', 'length', 'interview_question', 'sample_answer']
        }
      },
      technical_depth_audit: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            skill: { type: 'STRING' },
            has_depth: { type: 'BOOLEAN' },
            probing_question: { type: 'STRING' },
            answer_template: { type: 'STRING' }
          },
          required: ['skill', 'has_depth']
        }
      },
      domain_question_bank: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            question: { type: 'STRING' },
            model_answer: { type: 'STRING' },
            level: { type: 'STRING' }
          },
          required: ['question', 'model_answer', 'level']
        }
      },
      project_deep_dive: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            claim: { type: 'STRING' },
            follow_up_questions: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  question: { type: 'STRING' },
                  model_answer: { type: 'STRING' }
                },
                required: ['question', 'model_answer']
              }
            }
          },
          required: ['claim', 'follow_up_questions']
        }
      },
      hr_questions: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            question: { type: 'STRING' },
            sample_answer: { type: 'STRING' },
            personalization_note: { type: 'STRING' }
          },
          required: ['question', 'sample_answer', 'personalization_note']
        }
      },
      red_flags: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            issue: { type: 'STRING' },
            severity: { type: 'STRING' },
            fix_suggestion: { type: 'STRING' }
          },
          required: ['issue', 'severity', 'fix_suggestion']
        }
      },
      must_prepare_topics: {
        type: 'ARRAY',
        items: { type: 'STRING' }
      },
      fit_summary: { type: 'STRING' }
    },
    required: ['name', 'email', 'skills', 'experience', 'education', 'seniorityLevel', 'interviewQuestions', 'career_gaps', 'technical_depth_audit', 'domain_question_bank', 'project_deep_dive', 'hr_questions', 'red_flags', 'must_prepare_topics', 'fit_summary']
  };

  const prompt = `Parse this resume text and perform the recruiter seven-part analysis:\n\n${resumeText}`;
  const parsedData = await callAIProvider(prompt, systemInstruction, schema);
  mapAnalysisToQuestions(parsedData);
  return parsedData;
}

/**
 * Scores and ranks a candidate against a job description.
 */
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

/**
 * Generates intelligent categorized tags for a candidate based on recruiter preferences.
 */
export async function generateTags(candidateProfile, jobDescription, tagPreferences) {
  const systemInstruction = 'You are an expert AI recruiter. Evaluate the candidate profile and job description, then generate highly accurate, categorized tags based on the provided preference categories. You must return tags in the precise categories specified.';

  const schema = {
    type: 'ARRAY',
    description: 'List of tags assigned to the candidate',
    items: {
      type: 'OBJECT',
      properties: {
        category: { type: 'STRING', description: 'The exact name of the tag category from the preferences' },
        value: { type: 'STRING', description: 'The specific tag value (e.g. Senior, React, 3-5 years)' },
        confidence: { type: 'INTEGER', description: 'Confidence score of this tag assignment from 1-100' }
      },
      required: ['category', 'value', 'confidence']
    }
  };

  const prompt = `
Candidate Profile:
${JSON.stringify(candidateProfile, null, 2)}

Job Description:
Title: ${jobDescription?.title || 'General'}
Requirements: ${jobDescription?.requirements || 'N/A'}
Description: ${jobDescription?.description || 'N/A'}

Tag Categories & Preferences:
${JSON.stringify(tagPreferences, null, 2)}

Assign appropriate tags to this candidate for each of the specified tag categories. Use the possible values provided in the preferences if specified, otherwise infer standard industry tags. Keep tag values concise.
`;

  const result = await callAIProvider(prompt, systemInstruction, schema);
  if (Array.isArray(result)) {
    return result;
  } else if (result && Array.isArray(result.tags)) {
    return result.tags;
  } else if (result && typeof result === 'object') {
    for (const key of Object.keys(result)) {
      if (Array.isArray(result[key])) {
        return result[key];
      }
    }
  }
  return [];
}

/**
 * Scores and ranks a candidate against their own primary field of expertise/category.
 */
export async function scoreCandidateByOwnCategory(candidateProfile) {
  const systemInstruction = 'You are a professional HR screener and hiring manager. Evaluate the candidate\'s profile based on their own primary field of expertise (e.g. Software Engineer, Product Designer, QA) and output a score and details matching the schema.';

  const schema = {
    type: 'OBJECT',
    properties: {
      score: { 
        type: 'INTEGER', 
        description: 'Competency/seniority score between 0 and 100 indicating their strength in their primary field of expertise (e.g., 90+ for highly experienced experts, 70-89 for solid mid-level professionals, <70 for junior/entry-level or weak profiles).' 
      },
      matchingSkills: { 
        type: 'ARRAY', 
        items: { type: 'STRING' },
        description: 'Core strengths and key technologies/skills identified in their profile'
      },
      missingSkills: { 
        type: 'ARRAY', 
        items: { type: 'STRING' },
        description: 'Typical skills or tools for their level/field that are missing from their profile'
      },
      reasoning: { 
        type: 'STRING', 
        description: 'A 2-sentence professional explanation of why the candidate was given this competency score based on their experience and skills'
      }
    },
    required: ['score', 'matchingSkills', 'missingSkills', 'reasoning']
  };

  const prompt = `
Candidate Profile:
${JSON.stringify(candidateProfile, null, 2)}

Identify the candidate's primary job category (e.g. React Frontend Developer, Python Data Scientist) based on their resume, and score their overall competency in that specific category:`;

  return await callAIProvider(prompt, systemInstruction, schema);
}

/**
 * Generates job description and requirements using Gemini AI.
 */
export async function generateJobDescription(title, department, location, skills = '') {
  const systemInstruction = 'You are an expert AI recruiter and hiring manager. Create professional, engaging job descriptions and requirements based on the title, department, location, and key skills specified.';
  
  const schema = {
    type: 'OBJECT',
    properties: {
      description: {
        type: 'STRING',
        description: 'An engaging, professional overview of the role, team context, and responsibilities. (2-3 paragraphs)'
      },
      requirements: {
        type: 'STRING',
        description: 'Bulleted list of qualifications, experience, technical skills, and educational requirements.'
      }
    },
    required: ['description', 'requirements']
  };

  const prompt = `
Generate a job description and requirements for:
Job Title: ${title}
Department: ${department || 'Engineering'}
Location: ${location || 'Remote'}
Key Skills/Keywords: ${skills || 'standard requirements for this role'}
`;

  return await callAIProvider(prompt, systemInstruction, schema);
}

export async function generateQuestionsForCandidate(candidateProfile, jobDescription = null) {
  const systemInstruction = `You are a senior technical recruiter and hiring-panel interviewer. You have spent years interviewing candidates across multiple domains and you are known for catching exactly the things a resume tries to gloss over. When given a resume, you produce a detailed, structured analysis — never a generic summary. You ground every observation in specific facts from the resume (exact dates, company names, tools, numbers). You never invent facts that are not in the resume; if something is unclear, say so and ask about it.

Run the following seven-part analysis on every resume, in order.

### 1. Career Timeline & Gap Analysis
- Reconstruct the candidate's full timeline: education end dates, every job's start/end date, and any stated career breaks.
- Flag any gap of 2+ months between two consecutive entries (job-to-job, or education-to-first-job).
- For each gap, output: the exact date range, its length, one direct interview question the candidate should expect, and a sample answer the candidate could give — framed around plausible, positive explanations rather than inventing a specific real reason you don't know.
- If there are no gaps, state that explicitly — don't invent one.

### 2. Technical Depth Audit
- List every tool, technology, platform, or skill the resume names.
- For each one, judge whether it's backed by specifics (versions, named sub-components/services, scale, or outcome) or just name-dropped with no detail.
- For every skill that's name-dropped without depth, write one targeted question that would force the candidate to prove real hands-on experience, plus a short answer template showing what a strong, specific answer should cover so the candidate knows how to fill in their own real details.
- Do not flag a skill as shallow if the resume already gives a concrete example of its use.

### 3. Domain Knowledge Question Bank
- Identify the candidate's primary domain/specialty from their skills and job titles.
- Generate 8–15 domain concept questions a panel would realistically ask someone at this candidate's seniority level, ordered from fundamental to advanced.
- Provide a model answer (2–4 sentences) for each question, written the way a strong candidate would actually answer — not textbook definitions.
- Calibrate difficulty to the candidate's years of experience.

### 4. Project & Achievement Deep-Dive
- For each project or major responsibility listed, write one or two "prove it" follow-up questions that target the specific claim made (especially any number, percentage, or outcome stated), each with a model answer showing how a candidate who genuinely did the work would answer — written from the resume's own details, not invented specifics beyond what's plausible.
- Prioritize claims that sound impressive but are unsupported (e.g. a stated accuracy percentage, a scale claim, a "led the team" claim) — these get the most scrutiny.

### 5. HR & Behavioral Readiness
- Generate the standard HR question set, personalized with the candidate's actual details where possible: tell me about yourself; reason for leaving current/most recent company; reason for seeking a new role; current vs. expected compensation; why should we hire you; key strengths; 5-year vision; reason for any job change pattern observed.
- For each question, give a sample answer built from the candidate's actual resume facts wherever possible. Where the real reason isn't knowable, give a professional, plausible answer.
- If question 1 already surfaced a gap, reuse that gap's specific dates here too instead of a generic gap question.

### 6. Resume Red Flags & Quality Check
- Call out concrete quality issues only if actually present, such as: missing company names, missing certifications relevant to the field, no quantified outcomes anywhere, inconsistent or ambiguous dates, very short tenures without explanation, or skills listed with zero supporting context.
- Mark each flag with a severity (minor / moderate / major) and a one-line fix suggestion.

### 7. Must-Prepare Topics & Fit Summary
- Produce a checklist of 6–10 core topics this candidate should be ready to go deep on, derived from their actual listed skills.
- Close with a 2–3 sentence "why hire" pitch written in the candidate's own voice, using only facts present in the resume.`;

  const schema = {
    type: 'OBJECT',
    properties: {
      career_gaps: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            period: { type: 'STRING' },
            length: { type: 'STRING' },
            interview_question: { type: 'STRING' },
            sample_answer: { type: 'STRING' }
          },
          required: ['period', 'length', 'interview_question', 'sample_answer']
        }
      },
      technical_depth_audit: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            skill: { type: 'STRING' },
            has_depth: { type: 'BOOLEAN' },
            probing_question: { type: 'STRING' },
            answer_template: { type: 'STRING' }
          },
          required: ['skill', 'has_depth']
        }
      },
      domain_question_bank: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            question: { type: 'STRING' },
            model_answer: { type: 'STRING' },
            level: { type: 'STRING' }
          },
          required: ['question', 'model_answer', 'level']
        }
      },
      project_deep_dive: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            claim: { type: 'STRING' },
            follow_up_questions: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  question: { type: 'STRING' },
                  model_answer: { type: 'STRING' }
                },
                required: ['question', 'model_answer']
              }
            }
          },
          required: ['claim', 'follow_up_questions']
        }
      },
      hr_questions: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            question: { type: 'STRING' },
            sample_answer: { type: 'STRING' },
            personalization_note: { type: 'STRING' }
          },
          required: ['question', 'sample_answer', 'personalization_note']
        }
      },
      red_flags: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            issue: { type: 'STRING' },
            severity: { type: 'STRING' },
            fix_suggestion: { type: 'STRING' }
          },
          required: ['issue', 'severity', 'fix_suggestion']
        }
      },
      must_prepare_topics: {
        type: 'ARRAY',
        items: { type: 'STRING' }
      },
      fit_summary: { type: 'STRING' }
    },
    required: ['career_gaps', 'technical_depth_audit', 'domain_question_bank', 'project_deep_dive', 'hr_questions', 'red_flags', 'must_prepare_topics', 'fit_summary']
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

export { callAIProvider };
