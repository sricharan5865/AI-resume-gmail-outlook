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

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
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

/**
 * Calls the configured AI provider for email classification.
 * Replicates the multi-provider dispatch pattern from geminiParser.js.
 */
const emailCategorySchema = {
  type: 'OBJECT',
  properties: {
    category: { type: 'STRING' },
    confidence: { type: 'NUMBER' },
    reasoning: { type: 'STRING' }
  },
  required: ['category', 'confidence', 'reasoning']
};

const emailCategoryFallback = {
  category: 'Other',
  confidence: 0.5,
  reasoning: ''
};

async function callAIProviderForClassification(prompt, systemInstruction) {
  let settings = null;
  try {
    settings = await Settings.findById('global');
  } catch (e) {
    console.error('Failed to retrieve settings from DB for email categorization:', e.message);
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
        ],
        response_format: { type: 'json_object' }
      };

      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }, 30000);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini AI API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const text = result.choices?.[0]?.message?.content;
      if (!text) throw new Error('Gemini AI API returned an empty response.');
      return safeExtractAndParseJson(text, emailCategorySchema, emailCategoryFallback);
    } else {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json'
        }
      };

      if (systemInstruction) {
        requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }, 30000);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini API returned an empty response.');
      return safeExtractAndParseJson(text, emailCategorySchema, emailCategoryFallback);
    }
  } else if (aiProvider === 'openai') {
    const apiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('OpenAI API key is not configured.');

    const url = 'https://api.openai.com/v1/chat/completions';
    const requestBody = {
      model: 'gpt-4o-mini',
      messages: [
        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 8192,
      response_format: { type: 'json_object' }
    };

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }, 30000);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content;
    if (!text) throw new Error('OpenAI API returned an empty response.');
    return safeExtractAndParseJson(text, emailCategorySchema, emailCategoryFallback);
  } else if (aiProvider === 'claude') {
    const apiKey = settings?.claudeApiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Claude API key is not configured.');

    const url = 'https://api.anthropic.com/v1/messages';
    const requestBody = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8192,
      system: systemInstruction || undefined,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1
    };

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }, 30000);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text;
    if (!text) throw new Error('Claude API returned an empty response.');
    return safeExtractAndParseJson(text, emailCategorySchema, emailCategoryFallback);
  } else if (aiProvider === 'ollama') {
    const ollamaUrl = (settings?.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
    const ollamaModel = settings?.ollamaModel || 'llama3';

    const requestBody = {
      model: ollamaModel,
      messages: [
        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
        { role: 'user', content: prompt }
      ],
      stream: false,
      format: 'json',
      options: {
        temperature: 0.1,
        num_ctx: 2048,
        num_predict: 256
      }
    };

    const response = await fetchWithTimeout(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }, 180000);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const text = result.message?.content;
    if (!text) throw new Error('Ollama API returned an empty response.');
    return safeExtractAndParseJson(text, emailCategorySchema, emailCategoryFallback);
  } else {
    throw new Error(`Unsupported AI Provider: ${aiProvider}`);
  }
}

/**
 * Categorizes an email into one of: Resume, HR, Spam, Client, Interview, Notification, Other.
 * Uses the configured AI provider for classification.
 *
 * @param {{ subject: string, from: string, body: string, hasAttachments: boolean }} emailData
 * @returns {Promise<{ category: string, confidence: number, reasoning: string }>}
 */
export async function categorizeEmail({ subject, from, body, hasAttachments }) {
  const systemInstruction = 'You are an email classifier for an HR recruitment platform. Classify the email into exactly one category. Respond with valid JSON only.';

  const bodySnippet = (body || '').substring(0, 500);

  const prompt = `Classify this email into exactly one category.

Categories: Resume, HR, Spam, Client, Interview, Notification, Other

Email:
Subject: ${subject || '(No Subject)'}
From: ${from || 'Unknown'}
Has Attachments: ${hasAttachments ? 'Yes' : 'No'}
Body: ${bodySnippet}

Return JSON: { "category": "<one of the categories>", "confidence": <0-1>, "reasoning": "<short reason>" }`;

  try {
    const result = await callAIProviderForClassification(prompt, systemInstruction);
    return {
      category: result.category || 'Other',
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
      reasoning: result.reasoning || ''
    };
  } catch (error) {
    console.error('Email categorization error:', error.message);
    return { category: 'Other', confidence: 0, reasoning: 'Classification failed' };
  }
}
