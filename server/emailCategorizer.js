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
 * Calls the configured AI provider for email classification.
 * Replicates the multi-provider dispatch pattern from geminiParser.js.
 */
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
        max_tokens: 1000,
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' }
      };

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
      if (!text) throw new Error('Gemini AI API returned an empty response.');
      return JSON.parse(cleanJsonResponse(text));
    } else {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      };

      if (systemInstruction) {
        requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini API returned an empty response.');
      return JSON.parse(text);
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
      response_format: { type: 'json_object' }
    };

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
    if (!text) throw new Error('OpenAI API returned an empty response.');
    return JSON.parse(cleanJsonResponse(text));
  } else if (aiProvider === 'claude') {
    const apiKey = settings?.claudeApiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Claude API key is not configured.');

    const url = 'https://api.anthropic.com/v1/messages';
    const requestBody = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      system: systemInstruction || undefined,
      messages: [{ role: 'user', content: prompt }],
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
    if (!text) throw new Error('Claude API returned an empty response.');
    return JSON.parse(cleanJsonResponse(text));
  } else if (aiProvider === 'ollama') {
    const ollamaUrl = settings?.ollamaUrl || 'http://localhost:11434';
    const model = settings?.ollamaModel || 'llama3';

    const url = `${ollamaUrl.replace(/\/$/, '')}/api/chat`;
    const requestBody = {
      model,
      messages: [
        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
        { role: 'user', content: prompt }
      ],
      stream: false,
      format: 'json',
      options: { temperature: 0.1 }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const text = result.message?.content;
    if (!text) throw new Error('Ollama API returned an empty response.');
    return JSON.parse(cleanJsonResponse(text));
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
