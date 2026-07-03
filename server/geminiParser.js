import dotenv from 'dotenv';
import { Settings } from './models.js';
dotenv.config();

function extractJsonString(text) {
  if (typeof text !== 'string') return '';
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = text.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = text.lastIndexOf(']');
  }

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return text;
  }
  return text.substring(startIdx, endIdx + 1);
}

function repairJsonStrings(str) {
  let result = '';
  let inString = false;
  let i = 0;
  
  while (i < str.length) {
    const char = str[i];
    
    if (char === '\\') {
      result += str.substring(i, i + 2);
      i += 2;
      continue;
    }
    
    if (char === '"') {
      if (!inString) {
        inString = true;
        result += char;
        i++;
      } else {
        let j = i + 1;
        while (j < str.length && /\s/.test(str[j])) {
          j++;
        }
        const nextNonSpace = str[j];
        if (nextNonSpace === ',' || nextNonSpace === '}' || nextNonSpace === ']' || nextNonSpace === ':') {
          inString = false;
          result += char;
        } else {
          result += '\\"';
        }
        i++;
      }
    } else {
      result += char;
      i++;
    }
  }
  return result;
}

function statefulJsonRepair(str) {
  let repaired = '';
  let inString = false;
  let escape = false;
  const stack = [];
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (escape) {
      repaired += char;
      escape = false;
      continue;
    }
    
    if (char === '\\') {
      repaired += char;
      escape = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      repaired += char;
      continue;
    }
    
    if (inString) {
      if (char === '\n') {
        repaired += '\\n';
      } else if (char === '\r') {
        repaired += '\\r';
      } else if (char === '\t') {
        repaired += '\\t';
      } else if (char.charCodeAt(0) < 32) {
        repaired += '\\u' + ('0000' + char.charCodeAt(0).toString(16)).slice(-4);
      } else {
        repaired += char;
      }
      continue;
    }
    
    if (char === '{' || char === '[') {
      stack.push(char);
      repaired += char;
    } else if (char === '}') {
      if (stack.length > 0 && stack[stack.length - 1] === '{') {
        stack.pop();
        repaired += char;
      }
    } else if (char === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === '[') {
        stack.pop();
        repaired += char;
      }
    } else {
      repaired += char;
    }
  }
  
  if (inString) {
    repaired += '"';
  }
  
  repaired = repaired.trim();
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');
  repaired = repaired.replace(/[:,\s]+$/, '');
  
  while (stack.length > 0) {
    const open = stack.pop();
    if (open === '{') {
      repaired += '}';
    } else if (open === '[') {
      repaired += ']';
    }
  }
  
  return repaired;
}

function normalizeJsonKeys(parsed, schema) {
  if (!parsed || typeof parsed !== 'object' || !schema || !schema.properties) {
    return parsed;
  }
  
  const normalized = {};
  const schemaKeys = Object.keys(schema.properties);
  
  // Create a mapping of lowercase, stripped keys to the original schema keys
  const keyMap = {};
  schemaKeys.forEach(originalKey => {
    const cleanKey = originalKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    keyMap[cleanKey] = originalKey;
    // Map snake_case of camelCase as well
    const snake = originalKey.replace(/([A-Z])/g, "_$1").toLowerCase();
    keyMap[snake] = originalKey;
  });

  // Map the parsed keys to the correct schema keys
  for (const parsedKey in parsed) {
    const cleanParsedKey = parsedKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    const mappedKey = keyMap[parsedKey] || keyMap[cleanParsedKey];
    
    if (mappedKey) {
      normalized[mappedKey] = parsed[parsedKey];
    } else {
      normalized[parsedKey] = parsed[parsedKey];
    }
  }

  return normalized;
}

function getDefaultValueFromSchema(schema) {
  if (!schema) return null;
  if (schema.type === 'OBJECT' || schema.type === 'object') {
    const defaults = {};
    if (schema.properties) {
      for (const key in schema.properties) {
        defaults[key] = getDefaultValueFromSchema(schema.properties[key]);
      }
    }
    return defaults;
  }
  if (schema.type === 'ARRAY' || schema.type === 'array') {
    return [];
  }
  if (schema.type === 'STRING' || schema.type === 'string') {
    return '';
  }
  if (schema.type === 'INTEGER' || schema.type === 'integer' || schema.type === 'NUMBER' || schema.type === 'number') {
    return 0;
  }
  if (schema.type === 'BOOLEAN' || schema.type === 'boolean') {
    return false;
  }
  return null;
}

function mergeWithDefaults(obj, fallback) {
  if (fallback === undefined || fallback === null) return obj;
  if (obj === undefined || obj === null) {
    return JSON.parse(JSON.stringify(fallback));
  }
  if (Array.isArray(fallback)) {
    if (!Array.isArray(obj)) return JSON.parse(JSON.stringify(fallback));
    return obj;
  }
  if (typeof fallback === 'object' && typeof obj === 'object') {
    const merged = { ...obj };
    for (const key in fallback) {
      merged[key] = mergeWithDefaults(obj[key], fallback[key]);
    }
    return merged;
  }
  return obj;
}

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
  
  // Repair unescaped quotes inside string values
  clean = repairJsonStrings(clean);
  
  // Sanitize raw control characters in string literals
  clean = clean.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    return match
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, (char) => {
        return '\\u' + ('0000' + char.charCodeAt(0).toString(16)).slice(-4);
      });
  });

  return clean.trim();
}

function safeExtractAndParseJson(text, schema = null, fallback = null) {
  const extracted = extractJsonString(text);
  const cleaned = cleanJsonResponse(extracted);
  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    try {
      const repaired = statefulJsonRepair(cleaned);
      parsed = JSON.parse(repaired);
    } catch (repairError) {
      console.error('safeExtractAndParseJson: JSON repair failed.', repairError);
      parsed = null;
    }
  }

  if (parsed && typeof parsed === 'object' && schema) {
    parsed = normalizeJsonKeys(parsed, schema);
  }

  let defaults = fallback;
  if (schema) {
    const schemaDefaults = getDefaultValueFromSchema(schema);
    defaults = defaults ? { ...schemaDefaults, ...defaults } : schemaDefaults;
  }

  if (!parsed || typeof parsed !== 'object') {
    return defaults || {};
  }

  if (defaults) {
    return mergeWithDefaults(parsed, defaults);
  }
  return parsed;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 300000) {
  const controller = new AbortController();
  const signal = controller.signal;
  
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }
  
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  
  try {
    const response = await fetch(url, { ...options, signal });
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000} seconds`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function convertSchemaToStandard(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  
  const newSchema = Array.isArray(schema) ? [] : {};
  for (const key in schema) {
    if (key === 'type' && typeof schema[key] === 'string') {
      newSchema[key] = schema[key].toLowerCase();
    } else if (typeof schema[key] === 'object') {
      newSchema[key] = convertSchemaToStandard(schema[key]);
    } else {
      newSchema[key] = schema[key];
    }
  }
  return newSchema;
}

function getCompactSchemaInstructions(schema) {
  if (!schema) return '';
  let inst = '\n\nRESPOND WITH A SINGLE JSON OBJECT containing these exact keys:\n';
  
  function formatProperties(properties) {
    let props = [];
    for (const key in properties) {
      const prop = properties[key];
      let typeStr = prop.type || 'string';
      let desc = prop.description ? `(${prop.description})` : '';
      
      if (typeStr.toUpperCase() === 'ARRAY') {
        const itemType = prop.items?.type || 'string';
        if (itemType.toUpperCase() === 'OBJECT' && prop.items?.properties) {
          props.push(`"${key}": [ {${formatProperties(prop.items.properties)}} ] ${desc}`);
        } else {
          props.push(`"${key}": [ ${itemType.toLowerCase()} ] ${desc}`);
        }
      } else if (typeStr.toUpperCase() === 'OBJECT') {
        if (prop.properties) {
          props.push(`"${key}": {${formatProperties(prop.properties)}} ${desc}`);
        } else {
          props.push(`"${key}": object ${desc}`);
        }
      } else {
        props.push(`"${key}": ${typeStr.toLowerCase()} ${desc}`);
      }
    }
    return props.join(', ');
  }

  if (schema.properties) {
    inst += `{ ${formatProperties(schema.properties)} }`;
  }
  
  inst += '\nIMPORTANT: Return ONLY raw JSON, no markdown, no explanations.';
  return inst;
}

/**
 * Helper to call the configured AI Provider via direct HTTP POST.
 */
async function callAIProvider(prompt, systemInstruction = '', schema = null, pdfBase64 = null) {
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

      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }, 300000);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini AI API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const text = result.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('Gemini AI API returned an empty response.');
      }

      return schema ? safeExtractAndParseJson(text, schema) : cleanJsonResponse(text);
    } else {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

      const requestBody = {
        contents: [
          {
            parts: [
              ...(pdfBase64 ? [{ inlineData: { mimeType: 'application/pdf', data: pdfBase64 } }] : []),
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192
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

      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }, 300000);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Gemini API returned an empty response.');
      }

      return schema ? safeExtractAndParseJson(text, schema) : text;
    }
  } else if (aiProvider === 'openai') {
    const apiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured.');
    }

    const isOpenRouter = apiKey.startsWith('sk-or-');
    const url = isOpenRouter ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
    
    const standardSchema = schema ? convertSchemaToStandard(schema) : null;
    const userContent = standardSchema 
      ? `${prompt}\n\nOutput MUST be valid JSON matching the schema: ${JSON.stringify(standardSchema)}\nDo not include any chat prefix or suffix. Return ONLY the raw JSON object.` 
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

    if (standardSchema) {
      requestBody.response_format = { type: 'json_object' };
      if (isOpenRouter) {
        requestBody.messages.push({
          role: 'user',
          content: `Output MUST match JSON schema: ${JSON.stringify(standardSchema)}`
        });
      }
    }

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }, 300000);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('OpenAI API returned an empty response.');
    }

    return schema ? safeExtractAndParseJson(text, schema) : cleanJsonResponse(text);
  } else if (aiProvider === 'claude') {
    const apiKey = settings?.claudeApiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Claude API key is not configured.');
    }

    const isOpenRouter = apiKey.startsWith('sk-or-');
    const url = isOpenRouter ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.anthropic.com/v1/messages';
    const standardSchema = schema ? convertSchemaToStandard(schema) : null;
    const userContent = standardSchema 
      ? `${prompt}\n\nOutput MUST be valid JSON matching the schema: ${JSON.stringify(standardSchema)}\nDo not include any chat prefix or suffix. Return ONLY the raw JSON object.` 
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
        max_tokens: 8192
      };

      if (standardSchema) {
        requestBody.response_format = { type: 'json_object' };
        requestBody.messages.push({
          role: 'user',
          content: `Output MUST match JSON schema: ${JSON.stringify(standardSchema)}`
        });
      }

      response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }, 300000);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const text = result.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('Claude API returned an empty response.');
      }

      return schema ? safeExtractAndParseJson(text, schema) : cleanJsonResponse(text);

    } else {
      const requestBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 8192,
        system: systemInstruction || undefined,
        messages: [
          {
            role: 'user',
            content: pdfBase64 ? [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdfBase64
                }
              },
              {
                type: 'text',
                text: userContent
              }
            ] : userContent
          }
        ],
        temperature: 0.1
      };

      response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }, 300000);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const text = result.content?.[0]?.text;
      if (!text) {
        throw new Error('Claude API returned an empty response.');
      }

      return schema ? safeExtractAndParseJson(text, schema) : cleanJsonResponse(text);
    }
  } else if (aiProvider === 'ollama') {
    const ollamaUrl = (settings?.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
    const ollamaModel = settings?.ollamaModel || 'llama3';

    // For Ollama: merge a compact format instruction into the user prompt
    // instead of sending the massive raw JSON schema as a separate message
    let userContent = prompt;
    if (schema) {
      userContent += getCompactSchemaInstructions(schema);
    }

    const messages = [
      ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
      { role: 'user', content: userContent }
    ];

    const requestBody = {
      model: ollamaModel,
      messages,
      stream: false,
      options: {
        temperature: 0.1,
        num_ctx: 8192,
        num_predict: 2048
      }
    };

    if (schema) {
      requestBody.format = 'json';
    }

    const ollamaFetch = async (body) => {
      try {
        const response = await fetchWithTimeout(`${ollamaUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }, 900000);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
        }
        return await response.json();
      } catch (err) {
        if (err.message.includes('timed out')) {
          throw new Error('Ollama request timed out after 15 minutes. The model may be overloaded or the resume is too large.');
        }
        throw err;
      }
    };

    let result = await ollamaFetch(requestBody);
    let text = result.message?.content;
    
    // If the model returned an empty response, retry without format:'json' constraint
    if (!text) {
      console.warn('Ollama: Empty response on first attempt. Raw result:', JSON.stringify(result).substring(0, 500));
      console.warn('Ollama: Retrying without format:json constraint...');
      const retryBody = { ...requestBody };
      delete retryBody.format;
      // Add explicit JSON instruction to user message instead
      if (schema) {
        retryBody.messages = [
          ...retryBody.messages,
          { role: 'user', content: 'You MUST respond with valid JSON only. No markdown, no explanation, no code fences. Just the raw JSON object.' }
        ];
      }
      result = await ollamaFetch(retryBody);
      text = result.message?.content;
      if (!text) {
        console.error('Ollama: Empty response on retry as well. Full result:', JSON.stringify(result).substring(0, 1000));
        throw new Error('Ollama API returned an empty response. The model may not support this request format. Try a different model (e.g., llama3, qwen2).');
      }
    }

    // Detect truncated JSON: if we expected JSON but the response is cut off, try to repair it locally first or retry once with higher limit
    if (schema) {
      try {
        const testClean = cleanJsonResponse(text);
        JSON.parse(testClean);
      } catch (truncErr) {
        if (truncErr.message.includes('Unterminated') || truncErr.message.includes('Unexpected end')) {
          const testClean = cleanJsonResponse(text);
          console.warn('Ollama: Response appears truncated. Attempting to repair JSON locally first...');
          try {
            const repaired = statefulJsonRepair(testClean);
            JSON.parse(repaired);
            console.log('Ollama: Local JSON repair successful! Skipping API retry.');
            text = repaired;
          } catch (repairErr) {
            console.warn('Ollama: Local JSON repair failed. Retrying API request with extended token limit...');
            requestBody.options.num_predict = 4096;
            try {
              result = await ollamaFetch(requestBody);
              const newText = result.message?.content;
              if (newText) {
                text = newText;
              } else {
                console.warn('Ollama: API retry returned empty. Falling back to repaired first attempt.');
                text = statefulJsonRepair(testClean);
              }
            } catch (retryFetchErr) {
              console.error('Ollama: API retry failed:', retryFetchErr);
              console.warn('Ollama: Falling back to repaired first attempt.');
              text = statefulJsonRepair(testClean);
            }
          }
        }
      }
    }

    return schema ? safeExtractAndParseJson(text, schema) : cleanJsonResponse(text);
  } else {
    throw new Error(`Unsupported AI Provider: ${aiProvider}`);
  }
}

function mapAnalysisToQuestions(parsedData) {
  let hrQuestions = [];
  let technicalQuestions = [];

  // 1. Map Career Gaps to HR
  if (parsedData.career_gaps && Array.isArray(parsedData.career_gaps)) {
    parsedData.career_gaps.forEach(gap => {
      if (gap.interview_question && gap.sample_answer) {
        hrQuestions.push({
          question: gap.interview_question,
          answer: gap.sample_answer,
          importance: 'MUST ASK'
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
          answer: q.sample_answer,
          importance: 'GOOD TO ASK'
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
          answer: audit.answer_template,
          importance: 'VERY IMPORTANT'
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
          answer: q.model_answer,
          importance: 'GOOD TO ASK'
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
              answer: q.model_answer,
              importance: 'IMPORTANT'
            });
          }
        });
      }
    });
  }

  // Slice or fill to exactly 7 HR questions
  if (hrQuestions.length > 7) {
    hrQuestions = hrQuestions.slice(0, 7);
  } else {
    const defaultHr = [
      { question: "Tell me about your background and how it prepares you for this role?", answer: "I have a solid foundation in my field, have successfully delivered key projects in my previous roles, and quickly adapt to new stacks.", importance: "OPTIONAL" },
      { question: "Why are you interested in joining our company?", answer: "I admire your company's innovation, culture, and project scale, and believe my skills align perfectly with your team's goals.", importance: "OPTIONAL" },
      { question: "Describe a challenging situation at work and how you resolved it.", answer: "I faced a critical bug/blocker, analyzed the root cause, collaborated with the team, and deployed a resolution under pressure.", importance: "OPTIONAL" },
      { question: "Where do you see yourself in five years?", answer: "I aim to grow technically, take on architectural ownership, and mentor junior colleagues while contributing to core business goals.", importance: "OPTIONAL" },
      { question: "How do you handle disagreement within a technical team?", answer: "I present data, listen to other viewpoints objectively, and focus on the best solution for the project rather than personal opinion.", importance: "OPTIONAL" },
      { question: "What are your salary expectations?", answer: "I am open to a competitive offer based on the role's responsibilities, my experience, and market standards.", importance: "OPTIONAL" },
      { question: "Do you have any questions for us?", answer: "What are the biggest challenges the team is currently facing, and what does success look like in this role?", importance: "OPTIONAL" }
    ];
    let idx = 0;
    while (hrQuestions.length < 7 && idx < defaultHr.length) {
      if (!hrQuestions.some(q => q.question === defaultHr[idx].question)) {
        hrQuestions.push(defaultHr[idx]);
      }
      idx++;
    }
  }

  // Slice or fill to exactly 7 Technical questions
  if (technicalQuestions.length > 7) {
    technicalQuestions = technicalQuestions.slice(0, 7);
  } else {
    const defaultTech = [
      { question: "What is your primary technical stack and how do you decide which technology to use?", answer: "I prioritize technology based on scalability, maintainability, team familiarity, and the specific needs of the project.", importance: "OPTIONAL" },
      { question: "How do you ensure code quality and prevent bugs in production?", answer: "I write comprehensive unit tests, perform thorough code reviews, use CI/CD pipelines, and monitor system telemetry.", importance: "OPTIONAL" },
      { question: "Explain the difference between SQL and NoSQL databases, and when to use each.", answer: "Use SQL for structured, relational data with ACID compliance; use NoSQL for unstructured, high-throughput, horizontally scalable data.", importance: "OPTIONAL" },
      { question: "How do you optimize a slow database query or application bottleneck?", answer: "I profile execution plans, add appropriate database indexes, implement caching, and optimize algorithmic complexity.", importance: "OPTIONAL" },
      { question: "What is your approach to designing microservices or modular systems?", answer: "I design around domain-driven boundaries, ensure loose coupling, use asynchronous messaging, and prioritize API contract versioning.", importance: "OPTIONAL" },
      { question: "Describe your experience with cloud services and infrastructure-as-code.", answer: "I use AWS/GCP services for hosting, compute, and storage, and automate provisioning using tools like Terraform or CloudFormation.", importance: "OPTIONAL" },
      { question: "How do you stay up-to-date with new technologies and industry trends?", answer: "I read technical blogs, contribute to open source projects, build personal side-projects, and participate in developer communities.", importance: "OPTIONAL" }
    ];
    let idx = 0;
    while (technicalQuestions.length < 7 && idx < defaultTech.length) {
      if (!technicalQuestions.some(q => q.question === defaultTech[idx].question)) {
        technicalQuestions.push(defaultTech[idx]);
      }
      idx++;
    }
  }

  parsedData.hrQuestions = hrQuestions;
  parsedData.technicalQuestions = technicalQuestions;
}

function getRecruiterSystemInstruction(aiProvider) {
  if (aiProvider === 'ollama') {
    return `You are a senior technical recruiter. Analyze the resume facts and generate a structured JSON analysis.
1. Timeline & Gaps: Flag any gap >= 2 months. Include date range, length, probe question, and sample answer.
2. Technical Audit: List skills, judge if backed by specifics. Generate probing questions and sample answers for shallow skills.
3. Domain Bank: Generate EXACTLY 7 domain/technical questions (calibrated to seniority) with model answers.
4. Project & Achievement Deep-Dive: Write 1-2 probe questions for claims/projects with model answers. Identify and highlight specific projects the candidate has completed that match their skills.
5. HR & Behavioral: Generate EXACTLY 7 standard HR questions personalized with resume facts, plus model answers.
6. Red Flags: List quality issues (severity, fix suggestion).
7. Must-Prepare & Fit: Generate a checklist of 6-10 topics and a brief "why hire" summary.
8. Projects: List projects completed by the candidate (name, description, skills used).
CRITICAL: If you find a LinkedIn URL with OCR typos (e.g. "iinkedin" -> "linkedin"), fix the typo. Extract ALL data strictly from the resume text provided. Do NOT use any names, emails, or details from these instructions as candidate data.`;
  }
  return `You are a senior technical recruiter and hiring-panel interviewer. You have spent years interviewing candidates across multiple domains and you are known for catching exactly the things a resume tries to gloss over. When given a resume, you produce a detailed, structured analysis — never a generic summary. You ground every observation in specific facts from the resume (exact dates, company names, tools, numbers). You never invent facts that are not in the resume; if something is unclear, say so and ask about it.

Run the following eight-part analysis on every resume, in order.

### 1. Career Timeline & Gap Analysis
- Reconstruct the candidate's full timeline: education end dates, every job's start/end date, and any stated career breaks.
- Flag any gap of 2+ months between two consecutive entries (job-to-job, or education-to-first-job).
- For each gap, output: the exact date range, its length, one direct interview question the candidate should expect, and a sample answer.
- If there are no gaps, state that explicitly.

### 2. Technical Depth Audit
- List every tool, technology, platform, or skill the resume names.
- For each one, judge whether it's backed by specifics (versions, named sub-components/services, scale, or outcome) or just name-dropped.
- For every skill that's name-dropped without depth, write one targeted probing question plus a short answer template showing what a strong answer should cover.

### 3. Domain Knowledge Question Bank
- Generate EXACTLY 7 domain/technical concept questions a panel would realistically ask someone at this candidate's seniority level, ordered from fundamental to advanced.
- Provide a model answer (2–4 sentences) for each question.

### 4. Project & Achievement Deep-Dive
- For each project or major responsibility listed, write one or two "prove it" follow-up questions targeting specific claims/projects, each with a model answer showing how a candidate who did the work would answer. Identify and highlight specific projects the candidate has completed that match their skills.

### 5. HR & Behavioral Readiness
- Generate EXACTLY 7 standard HR questions, personalized with the candidate's actual details: tell me about yourself; reason for leaving most recent company; reason for seeking a new role; expected compensation; why hire you; key strengths; 5-year vision. Provide sample answers built from the candidate's actual resume facts.

### 6. Resume Red Flags & Quality Check
- Call out concrete quality issues if present (severity, fix suggestion).

### 7. Must-Prepare Topics & Fit Summary
- Produce a checklist of 6–10 core topics this candidate should prepare, and a 2-3 sentence "why hire" pitch.

### 8. Projects & Skills Mapping
- List the candidate's projects. For each project, extract its name, description, and the matching skills/technologies from the candidate's skill list used in that project.

CRITICAL: Extract ALL candidate data (name, email, phone, skills, experience, projects) strictly from the resume text provided below. Do NOT use any names, examples, or details from these instructions as candidate data. If a LinkedIn URL contains OCR typos, fix the typo and reconstruct the full URL.`;
}

/**
 * Parses resume text into structured JSON format.
 */
export async function parseResume(resumeText, pdfBase64 = null) {
  if ((!resumeText || resumeText.trim().length === 0) && !pdfBase64) {
    throw new Error('Failed to extract text from PDF. The resume might be an image or a scanned document.');
  }

  let settings = null;
  try {
    settings = await Settings.findById('global');
  } catch (e) {}
  const aiProvider = settings?.aiProvider || 'gemini';

  const systemInstruction = getRecruiterSystemInstruction(aiProvider);
  
  const schema = {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING', description: 'Full name of the candidate' },
      email: { type: 'STRING', description: 'Primary email address' },
      phone: { type: 'STRING', description: 'Phone number' },
      linkedinUrl: { 
        type: 'STRING', 
        description: 'Full LinkedIn profile URL found in the resume. Fix OCR typos like "iinkedin" to "linkedin". Return empty string if not present.' 
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
      fit_summary: { type: 'STRING' },
      projects: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'Name of the project' },
            description: { type: 'STRING', description: 'Brief description of what the project did and accomplishments' },
            matchingSkills: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: 'Skills or technologies from the candidate\'s skill list used in this project'
            }
          },
          required: ['name', 'description', 'matchingSkills']
        }
      }
    },
    required: ['name', 'email', 'skills', 'experience', 'education', 'seniorityLevel', 'interviewQuestions', 'career_gaps', 'technical_depth_audit', 'domain_question_bank', 'project_deep_dive', 'hr_questions', 'red_flags', 'must_prepare_topics', 'fit_summary', 'projects']
  };

  const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
  const isOpenRouter = apiKey?.startsWith('sk-or-') || false;
  const isDirectGemini = aiProvider === 'gemini' && !isOpenRouter;
  const isClaude = aiProvider === 'claude';
  const canUsePdfDirectly = isDirectGemini || (isClaude && !isOpenRouter);

  const prompt = (pdfBase64 && canUsePdfDirectly)
    ? `Analyze the attached PDF resume and perform the recruiter seven-part analysis.`
    : `Parse this resume text and perform the recruiter seven-part analysis:\n\n${resumeText}`;
  const parsedData = await callAIProvider(prompt, systemInstruction, schema, canUsePdfDirectly ? pdfBase64 : null);
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
  let settings = null;
  try {
    settings = await Settings.findById('global');
  } catch (e) {}
  const aiProvider = settings?.aiProvider || 'gemini';

  const systemInstruction = getRecruiterSystemInstruction(aiProvider);

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
