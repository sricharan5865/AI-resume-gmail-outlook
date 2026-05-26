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
        max_tokens: 2000,
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
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const text = result.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('OpenRouter API returned an empty response.');
      }

      const cleanedText = cleanJsonResponse(text);
      return schema ? JSON.parse(cleanedText) : cleanedText;
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

      return schema ? JSON.parse(text) : text;
    }
  } else if (aiProvider === 'openai') {
    const apiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured.');
    }

    const url = 'https://api.openai.com/v1/chat/completions';
    const userContent = schema 
      ? `${prompt}\n\nOutput MUST be valid JSON matching the schema: ${JSON.stringify(schema)}\nDo not include any chat prefix or suffix. Return ONLY the raw JSON object.` 
      : prompt;

    const requestBody = {
      model: 'gpt-4o-mini',
      messages: [
        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
        { role: 'user', content: userContent }
      ],
      temperature: 0.1
    };

    if (schema) {
      requestBody.response_format = { type: 'json_object' };
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
    return schema ? JSON.parse(cleanedText) : cleanedText;
  } else if (aiProvider === 'claude') {
    const apiKey = settings?.claudeApiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Claude API key is not configured.');
    }

    const url = 'https://api.anthropic.com/v1/messages';
    const userContent = schema 
      ? `${prompt}\n\nOutput MUST be valid JSON matching the schema: ${JSON.stringify(schema)}\nDo not include any chat prefix or suffix. Return ONLY the raw JSON object.` 
      : prompt;

    const requestBody = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      system: systemInstruction || undefined,
      messages: [
        { role: 'user', content: userContent }
      ],
      temperature: 0.1
    };

    const response = await fetch(url, {
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
    return schema ? JSON.parse(cleanedText) : cleanedText;
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
    return schema ? JSON.parse(cleanedText) : cleanedText;
  } else {
    throw new Error(`Unsupported AI Provider: ${aiProvider}`);
  }
}

/**
 * Parses resume text into structured JSON format.
 */
export async function parseResume(resumeText) {
  if (!resumeText || resumeText.trim().length === 0) {
    throw new Error('Failed to extract text from PDF. The resume might be an image or a scanned document.');
  }

  const systemInstruction = `You are an expert resume parsing AI. Extract structured data from the provided resume text exactly matching the schema.
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
      }
    },
    required: ['name', 'email', 'skills', 'experience', 'education']
  };

  const prompt = `Parse this resume text:\n\n${resumeText}`;
  return await callAIProvider(prompt, systemInstruction, schema);
}

/**
 * Scores and ranks a candidate against a job description.
 */
export async function scoreCandidate(candidateProfile, jobDescription) {
  const systemInstruction = 'You are a professional HR screener and hiring manager. Evaluate the candidate against the job description and output a score and details matching the schema.';

  const schema = {
    type: 'OBJECT',
    properties: {
      score: { 
        type: 'INTEGER', 
        description: 'Match score between 0 and 100 indicating fit. Be realistic (e.g. matching all requirements is 95+, partial is 50-70, poor is <50).' 
      },
      matchingSkills: { 
        type: 'ARRAY', 
        items: { type: 'STRING' },
        description: 'Skills the candidate has that are requested or relevant to the job description'
      },
      missingSkills: { 
        type: 'ARRAY', 
        items: { type: 'STRING' },
        description: 'Skills or tools mentioned in the job description that the candidate does not seem to have'
      },
      reasoning: { 
        type: 'STRING', 
        description: 'A 2-sentence professional explanation of why the candidate was given this score based on their experience and skills'
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

Evaluate this candidate for the job:`;

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
