// Test suite for the resilient JSON parser helpers (version 2)

function extractJson(text) {
  if (typeof text !== 'string') return '';
  const start = text.indexOf('{');
  const bracketStart = text.indexOf('[');
  if (start === -1 && bracketStart === -1) return '';
  
  let isArray = false;
  let startIndex = start;
  if (start === -1 || (bracketStart !== -1 && bracketStart < start)) {
    isArray = true;
    startIndex = bracketStart;
  }
  
  const openChar = isArray ? '[' : '{';
  const closeChar = isArray ? ']' : '}';
  
  let depth = 0;
  let inString = false;
  let escape = false;
  
  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === openChar) {
        depth++;
      } else if (char === closeChar) {
        depth--;
        if (depth === 0) {
          return text.substring(startIndex, i + 1);
        }
      }
    }
  }
  
  return text.substring(startIndex);
}

function repairTruncatedJson(str) {
  str = str.trim();
  if (!str) return '{}';
  
  const depthStack = [];
  let inString = false;
  let escape = false;
  let cleaned = '';
  let lastStringStartIndex = -1;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (escape) {
      cleaned += char;
      escape = false;
      continue;
    }
    if (char === '\\') {
      cleaned += char;
      escape = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      if (inString) {
        lastStringStartIndex = cleaned.length;
      }
      cleaned += char;
      continue;
    }
    
    if (!inString) {
      if (char === '{' || char === '[') {
        depthStack.push(char);
      } else if (char === '}') {
        if (depthStack[depthStack.length - 1] === '{') {
          depthStack.pop();
        }
      } else if (char === ']') {
        if (depthStack[depthStack.length - 1] === '[') {
          depthStack.pop();
        }
      }
    }
    cleaned += char;
  }
  
  if (inString && lastStringStartIndex !== -1) {
    let prevChar = '';
    for (let j = lastStringStartIndex - 1; j >= 0; j--) {
      if (!/\s/.test(cleaned[j])) {
        prevChar = cleaned[j];
        break;
      }
    }
    
    const parentContainer = depthStack[depthStack.length - 1];
    
    if (parentContainer === '{' && (prevChar === ',' || prevChar === '{')) {
      cleaned = cleaned.substring(0, lastStringStartIndex).trim();
      if (cleaned.endsWith(',')) {
        cleaned = cleaned.slice(0, -1).trim();
      }
    } else {
      if (cleaned.endsWith('\\')) {
        cleaned = cleaned.slice(0, -1);
      }
      cleaned += '"';
    }
  }
  
  cleaned = cleaned.trim();
  let changed = true;
  while (changed) {
    changed = false;
    if (cleaned.endsWith(',')) {
      cleaned = cleaned.slice(0, -1).trim();
      changed = true;
    } else if (cleaned.endsWith(':')) {
      const lastQuote = cleaned.lastIndexOf('"');
      if (lastQuote !== -1) {
        const prevQuote = cleaned.lastIndexOf('"', lastQuote - 1);
        if (prevQuote !== -1) {
          cleaned = cleaned.substring(0, prevQuote).trim();
          if (cleaned.endsWith(',')) {
            cleaned = cleaned.slice(0, -1).trim();
          }
          changed = true;
        }
      }
    }
  }
  
  while (depthStack.length > 0) {
    const openChar = depthStack.pop();
    if (openChar === '{') {
      cleaned += '}';
    } else if (openChar === '[') {
      cleaned += ']';
    }
  }
  
  return cleaned;
}

function getDefaultsFromSchema(schema) {
  if (!schema) return null;
  const type = (schema.type || '').toUpperCase();
  if (type === 'OBJECT') {
    const defaults = {};
    if (schema.properties) {
      for (const key in schema.properties) {
        defaults[key] = getDefaultsFromSchema(schema.properties[key]);
      }
    }
    return defaults;
  } else if (type === 'ARRAY') {
    return [];
  } else if (type === 'STRING') {
    return '';
  } else if (type === 'INTEGER' || type === 'NUMBER') {
    return 0;
  } else if (type === 'BOOLEAN') {
    return false;
  }
  return null;
}

function mergeWithDefaults(parsed, defaults) {
  if (defaults === null || defaults === undefined) return parsed;
  if (parsed === null || parsed === undefined) {
    return Array.isArray(defaults) ? [...defaults] : (typeof defaults === 'object' ? { ...defaults } : defaults);
  }
  
  if (Array.isArray(defaults)) {
    return Array.isArray(parsed) ? parsed : [];
  }
  
  if (typeof defaults === 'object') {
    const merged = { ...defaults };
    for (const key in defaults) {
      if (parsed[key] !== undefined && parsed[key] !== null) {
        merged[key] = mergeWithDefaults(parsed[key], defaults[key]);
      }
    }
    return merged;
  }
  
  if (typeof defaults === 'string') return String(parsed);
  if (typeof defaults === 'number') return Number(parsed) || 0;
  if (typeof defaults === 'boolean') return Boolean(parsed);
  
  return parsed;
}

// RUN TESTS
const testCases = [
  {
    name: 'Normal JSON surrounded by text',
    input: 'Here is the response:\n```json\n{"name": "Alice", "score": 95}\n```\nHope it helps!',
    expected: { name: 'Alice', score: 95 }
  },
  {
    name: 'Truncated JSON string value',
    input: '{"name": "Alice", "summary": "She is a software developer who has',
    expected: { name: 'Alice', summary: 'She is a software developer who has' }
  },
  {
    name: 'Truncated JSON object property key',
    input: '{"name": "Alice", "skills": ["React", "Node"], "expe',
    expected: { name: 'Alice', skills: ['React', 'Node'] }
  },
  {
    name: 'Truncated JSON in array',
    input: '{"name": "Alice", "skills": ["React", "Node',
    expected: { name: 'Alice', skills: ['React', 'Node'] }
  },
  {
    name: 'Truncated JSON with trailing comma',
    input: '{"name": "Alice", "skills": ["React"], ',
    expected: { name: 'Alice', skills: ['React'] }
  }
];

const schema = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    summary: { type: 'STRING' },
    skills: { type: 'ARRAY', items: { type: 'STRING' } },
    score: { type: 'INTEGER' }
  }
};

const defaults = getDefaultsFromSchema(schema);

console.log('Defaults:', JSON.stringify(defaults));

testCases.forEach(tc => {
  const extracted = extractJson(tc.input);
  const repaired = repairTruncatedJson(extracted);
  let parsed;
  try {
    parsed = JSON.parse(repaired);
    const merged = mergeWithDefaults(parsed, defaults);
    console.log(`PASS: ${tc.name}`);
    console.log(`  Parsed: ${JSON.stringify(merged)}`);
  } catch (err) {
    console.log(`FAIL: ${tc.name}`);
    console.log(`  Input: ${tc.input}`);
    console.log(`  Extracted: ${extracted}`);
    console.log(`  Repaired: ${repaired}`);
    console.log(`  Error: ${err.message}`);
  }
});
