# JSON Parsing and API Integration Vulnerability Audit Report

## 1. Observation

During the static code analysis of the `server` and `client` codebases, the following specific JSON parsing and API integration issues were observed:

### Observation A: Unhandled Mongoose Operations in Settings Endpoints
In `server/server.js`, the endpoints `/api/settings` and `/api/settings/tag-preferences` execute database operations using `Settings.findOneAndUpdate` without wrapping them in `try-catch` blocks.
*   **File:** `server/server.js` (Lines 1895-1927)
```javascript
1895: app.post('/api/settings', authenticateToken, requireRole(['admin']), async (req, res) => {
1896:   const allowedSettingsKeys = [
1897:     'tagPreferences', 'sourcingAgentActive', 'emailProvider', 'emailUser', 'emailPassword',
1898:     'outlookClientId', 'outlookTenantId', 'outlookClientSecret', 'outlookUserEmail',
1899:     'aiProvider', 'geminiApiKey', 'openaiApiKey', 'claudeApiKey',
1900:     'ollamaUrl', 'ollamaModel',
1901:     'rankAccordingToJob'
1902:   ];
1903: 
1904:   const updateData = {};
1905:   for (const key of allowedSettingsKeys) {
1906:     if (req.body[key] !== undefined) {
1907:       updateData[key] = req.body[key];
1908:     }
1909:   }
1910: 
1911:   const settings = await Settings.findOneAndUpdate(
1912:     { _id: 'global' }, 
1913:     { $set: updateData }, 
1914:     { new: true, upsert: true }
1915:   );
1916:   
1917:   // Trigger background connection test immediately
1918:   testConnectionInBackground().catch(err => console.error('Background connection test failed:', err));
1919: 
1920:   const safeSettings = settings.toObject();
...
1926:   res.json(safeSettings);
1927: });
```
*   **File:** `server/server.js` (Lines 1993-2000)
```javascript
1993: app.post('/api/settings/tag-preferences', authenticateToken, requireRole(['admin']), async (req, res) => {
1994:   const settings = await Settings.findOneAndUpdate(
1995:     { _id: 'global' }, 
1996:     { $set: { tagPreferences: req.body.tagPreferences || [] } }, 
1997:     { new: true, upsert: true }
1998:   );
1999:   res.json(settings.tagPreferences);
2000: });
```

### Observation B: Unhandled Client-side `JSON.parse` on `localStorage`
The frontend application calls `JSON.parse` on data retrieved from `localStorage` without any error handling.
*   **File:** `client/src/App.jsx` (Line 22)
```javascript
22:       return JSON.parse(localStorage.getItem('user')) || null;
```
*   **File:** `client/src/components/RAGSearch.jsx` (Line 13)
```javascript
13:     return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
```

### Observation C: Naive JSON Repair Logic for LLM Responses
In `server/geminiParser.js`, the function `repairJsonStrings` tries to escape double quotes inside string values using simple regex-like forward scans.
*   **File:** `server/geminiParser.js` (Lines 5-44)
```javascript
5: function repairJsonStrings(str) {
6:   let result = '';
7:   let inString = false;
8:   let i = 0;
9:   
10:   while (i < str.length) {
11:     const char = str[i];
12:     
13:     if (char === '\\') {
14:       result += str.substring(i, i + 2);
15:       i += 2;
16:       continue;
17:     }
18:     
19:     if (char === '"') {
20:       if (!inString) {
21:         inString = true;
22:         result += char;
23:         i++;
24:       } else {
25:         let j = i + 1;
26:         while (j < str.length && /\s/.test(str[j])) {
27:           j++;
28:         }
29:         const nextNonSpace = str[j];
30:         if (nextNonSpace === ',' || nextNonSpace === '}' || nextNonSpace === ']' || nextNonSpace === ':') {
31:           inString = false;
32:           result += char;
33:         } else {
34:           result += '\\"';
35:         }
36:         i++;
37:       }
38:     } else {
39:       result += char;
40:       i++;
41:     }
42:   }
43:   return result;
44: }
```

### Observation D: Omission of JSON String Repair in Email Sourcing
In `server/emailCategorizer.js`, the JSON cleaning helper `cleanJsonResponse` does not feature the `repairJsonStrings` logic found in `geminiParser.js`, making email categorization more susceptible to raw LLM format anomalies.
*   **File:** `server/emailCategorizer.js` (Lines 6-29)
```javascript
6: function cleanJsonResponse(text) {
7:   let clean = text.trim();
8:   if (clean.startsWith('```json')) {
9:     clean = clean.substring(7);
10:   } else if (clean.startsWith('```')) {
11:     clean = clean.substring(3);
12:   }
13:   if (clean.endsWith('```')) {
14:     clean = clean.substring(0, clean.length - 3);
15:   }
16:   
17:   // Sanitize raw control characters in string literals
18:   clean = clean.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
19:     return match
20:       .replace(/\n/g, '\\n')
21:       .replace(/\r/g, '\\r')
22:       .replace(/\t/g, '\\t')
23:       .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, (char) => {
24:         return '\\u' + ('0000' + char.charCodeAt(0).toString(16)).slice(-4);
25:       });
26:   });
27: 
28:   return clean.trim();
29: }
```

### Observation E: Missing Input Validation in Duplicate Resolution API
The `/api/candidates/upload/resolve` endpoint accepts a payload containing `parsedData` and accesses its keys without validating if `parsedData` is defined or structured properly.
*   **File:** `server/server.js` (Lines 1318-1323, 1342)
```javascript
1318: app.post('/api/candidates/upload/resolve', authenticateToken, requireRole(['admin', 'recruiter']), async (req, res) => {
1319:   const { action, candidateId, tempFile, parsedData, pdfText, jobId, logId } = req.body;
1320: 
1321:   try {
1322:     if (action === 'update') {
...
1342:       candidate.name = parsedData.name || candidate.name;
```

---

## 2. Logic Chain

1. **Settings / Config Crashes (Observation A):** If an admin saves settings (such as a malformed array for `tagPreferences` or a non-string type for properties like `emailProvider`), Mongoose model validation throws a validation error during `Settings.findOneAndUpdate`. Because there is no `try-catch` wrapper inside these async Express routes, Node.js triggers an unhandled promise rejection. In modern configurations, this can crash the server process.
2. **Client-side State Crashes (Observation B):** If the user's browser `localStorage` gets corrupted or has invalid formatting for keys `user` or `RAGSearchHistory`, loading the app or mounting the RAGSearch view calls `JSON.parse` directly on the malformed strings. This throws a `SyntaxError` which crashes the React UI rendering tree (resulting in a blank white screen).
3. **Fragile JSON Repair Logic (Observation C):** The `repairJsonStrings` function looks at the next non-space character to decide whether a double quote terminates a string or is an internal quote needing escaping. If a string value genuinely contains an unescaped double quote that happens to be followed by a comma or colon (e.g., `{"description": "Experienced in \"Python\", \"Java\", and C++"}`), the helper incorrectly thinks the string has terminated, causing it to fail to escape subsequent quotes or corrupt the overall JSON format. This results in a parsing exception.
4. **Lack of Resilient Parsing in Sourcing (Observation D):** In `server/emailCategorizer.js`, there is no string repair process. Furthermore, the `cleanJsonResponse` function assumes that markdown backticks (` ```json ` or ` ``` `) only appear at the very start or end of the trimmed string. If the LLM includes conversational prologue/epilogue (e.g., `Here is the categorization: ```json ...` ), the backticks will not be removed, causing `JSON.parse` to fail.
5. **API Payload Injection / Validation Flaws (Observation E):** If a client sends an HTTP request to `/api/candidates/upload/resolve` where `parsedData` is missing or empty, accessing `parsedData.name` at line 1342 will throw a `TypeError`. Although this route has an outer `try-catch` block preventing a full process crash, it responds with a generic 500 status rather than a structured 400 Bad Request validation response, which is a bad practice and susceptible to API exploitation.

---

## 3. Caveats

*   **Database Constraints:** This audit assumes MongoDB/Mongoose validation behavior under default configurations. If schema validation is disabled or bypassed globally, some validation errors might not trigger.
*   **External API Responses:** The vulnerability of LLM output parsing is highly dependent on the choice of local models (e.g., Llama-3-8B vs. small custom fine-tunes). Smaller local models hosted on Ollama are significantly more prone to generating malformed JSON outputs or violating schemas.

---

## 4. Conclusion

The application is generally robust in wrapping resume uploads and RAG operations with `try-catch` blocks, but suffers from critical vulnerabilities in:
1.  **Process stability:** Lack of handler-level error handling in `settings` endpoints can crash the backend under malformed payloads.
2.  **Client stability:** Unprotected `JSON.parse` calls on `localStorage` inputs can cause application-wide white-screens.
3.  **Parsing robustness:** LLM integration parses strings naively and is highly prone to failures when dealing with unescaped quotes or conversational markdown from local models.

### Recommended Mitigation Strategies

#### Recommendation 1: Wrap settings updates in `try-catch` and validate payload structure
Apply standard error handling and type-checking middleware on settings updates:
```javascript
app.post('/api/settings', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const allowedSettingsKeys = [ ... ];
    // Validate tagPreferences is an array if provided
    if (req.body.tagPreferences && !Array.isArray(req.body.tagPreferences)) {
      return res.status(400).json({ error: 'tagPreferences must be an array' });
    }
    // ... sanitize and save settings ...
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

#### Recommendation 2: Guard Client-side `JSON.parse` calls
Use safe parsing wrappers on the client side:
```javascript
// Helper for client-side safe parsing
export function safeGetLocalStorage(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error(`Error parsing localStorage key "${key}":`, e);
    return defaultValue;
  }
}
```

#### Recommendation 3: Use a Regex-based JSON extractor for LLM responses
Instead of relying on backticks matching the start and end of strings, extract JSON contents using a regex:
```javascript
function extractAndParseJSON(text) {
  try {
    // 1. Try direct parse first
    return JSON.parse(text);
  } catch (e) {
    // 2. Try extracting JSON block via regex if there's conversational wrap
    const jsonMatch = text.match(/[\s\S]*?(\[\s*\{[\s\S]*\}\s*\]|\{[\s\S]*\})/);
    if (jsonMatch) {
      try {
        return JSON.parse(cleanJsonResponse(jsonMatch[1]));
      } catch (innerErr) {
        // 3. Fall back to a robust JSON repair tool or throw structured error
        throw new Error('Failed to parse extracted JSON content: ' + innerErr.message);
      }
    }
    throw e;
  }
}
```

#### Recommendation 4: Validate inputs in `/api/candidates/upload/resolve`
Verify `parsedData` is present and structurally correct before performing database operations:
```javascript
if (!parsedData || typeof parsedData !== 'object') {
  return res.status(400).json({ error: 'Missing or invalid parsedData object.' });
}
```

---

## 5. Verification Method

To verify the vulnerabilities and test their resolutions:

1.  **Test Settings Crash:**
    Send a POST request to `/api/settings` with a non-array value for `tagPreferences` (e.g. `{"tagPreferences": "not-an-array"}`) and observe if the server crashes (throws an unhandled promise rejection).
2.  **Test Client crash:**
    Set a malformed string (e.g. `{invalid-json}`) into the `user` or `RAGSearchHistory` key in the browser console:
    ```javascript
    localStorage.setItem('user', '{invalid-json');
    ```
    Refresh the page and check if the application fails to render and shows a blank screen.
3.  **Verify LLM parser weakness:**
    Run unit tests on `repairJsonStrings` inside `server/geminiParser.js` using mock string values containing internal unescaped quotes followed by commas/colons, e.g. `{"skills": ["Node.js", "databases like "MongoDB", "MySQL"", "React"]}` to check if it fails to parse properly.
