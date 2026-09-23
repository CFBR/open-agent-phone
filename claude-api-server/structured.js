/**
 * Structured JSON Output helpers for Claude responses.
 *
 * Goal: make Claude usable from automation (n8n) by:
 * - Prompting for a single JSON object
 * - Extracting JSON from mixed prose/markdown responses
 * - Validating required fields
 * - Retrying once with a "repair" prompt when invalid
 */

function buildQueryContext({
  queryType,
  requiredFields,
  fieldGuidance,
  allowExtraFields = true,
  example,
}) {
  const required = Array.isArray(requiredFields) ? requiredFields : [];
  const guidanceLines = fieldGuidance && typeof fieldGuidance === 'object'
    ? Object.entries(fieldGuidance).map(([key, value]) => `- ${key}: ${String(value)}`)
    : [];

  const exampleBlock = example ? `\nExample JSON (shape only):\n${JSON.stringify(example, null, 2)}\n` : '';

  return `[STRUCTURED QUERY CONTEXT]
You are responding to an automation system (n8n). Your output must be machine-parseable.

Return EXACTLY ONE valid JSON object.
- No markdown
- No code fences
- No backticks
- No explanations
- No leading/trailing text

Query type: ${queryType || 'generic'}
Required fields (must be present as keys): ${JSON.stringify(required)}
Missing/unknown values: use null (not "unknown", not empty string).
${allowExtraFields ? 'Extra fields allowed if useful.' : 'Do not include extra fields.'}

Field guidance:
${guidanceLines.length ? guidanceLines.join('\n') : '- (none)'}
${exampleBlock}[END STRUCTURED QUERY CONTEXT]

`;
}

function buildStructuredPrompt({
  devicePrompt,
  queryContext,
  userPrompt,
}) {
  let fullPrompt = '';

  if (devicePrompt) {
    fullPrompt += `[DEVICE IDENTITY]\n${devicePrompt}\n[END DEVICE IDENTITY]\n\n`;
  }

  fullPrompt += queryContext;
  fullPrompt += String(userPrompt || '');
  return fullPrompt;
}

function stripBom(text) {
  return text && text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function extractJsonCandidates(text) {
  const input = stripBom(String(text || ''));
  const candidates = [];

  // 1) Prefer fenced ```json blocks if present.
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let match;
  while ((match = fenceRegex.exec(input)) !== null) {
    const inside = match[1].trim();
    if (inside) candidates.push(inside);
  }

  // 2) Scan for balanced { ... } / [ ... ] blocks (handles prose around JSON).
  const starts = [];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '{' || ch === '[') starts.push(i);
  }

  for (const startIndex of starts) {
    const startChar = input[startIndex];
    const endChar = startChar === '{' ? '}' : ']';

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIndex; i < input.length; i++) {
      const ch = input[i];

      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === startChar) depth++;
      if (ch === endChar) depth--;

      if (depth === 0) {
        const candidate = input.slice(startIndex, i + 1).trim();
        if (candidate) candidates.push(candidate);
        break;
      }
    }
  }

  // De-dupe, preserve order.
  return [...new Set(candidates)];
}

function tryParseJsonFromText(text) {
  const candidates = extractJsonCandidates(text);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      return { ok: true, jsonText: candidate, data: parsed, candidatesTried: candidates.length };
    } catch {
      // keep trying
    }
  }

  return {
    ok: false,
    error: 'No valid JSON found in response',
    candidatesTried: candidates.length,
  };
}

function getByPath(obj, path) {
  const parts = String(path).split('.').filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur && typeof cur === 'object' && part in cur) cur = cur[part];
    else return undefined;
  }
  return cur;
}

function validateRequiredFields(data, requiredFields) {
  const required = Array.isArray(requiredFields) ? requiredFields : [];
  const missing = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, missing: required, error: 'Parsed JSON is not an object' };
  }

  for (const field of required) {
    const value = getByPath(data, field);
    if (value === undefined) missing.push(field);
  }

  if (missing.length) {
    return { ok: false, missing, error: `Missing required fields: ${missing.join(', ')}` };
  }

  return { ok: true };
}

function buildRepairPrompt({
  queryType,
  requiredFields,
  fieldGuidance,
  allowExtraFields = true,
  originalUserPrompt,
  invalidAssistantOutput,
  example,
}) {
  const queryContext = buildQueryContext({ queryType, requiredFields, fieldGuidance, allowExtraFields, example });

  return `${queryContext}[REPAIR TASK]
The previous assistant output was not valid JSON or did not include required fields.
Reformat and return ONLY the corrected JSON object that answers the user's request.

User request:
"""${String(originalUserPrompt || '').trim()}"""

Invalid assistant output:
"""${String(invalidAssistantOutput || '').trim()}"""
[END REPAIR TASK]
`;
}

module.exports = {
  buildQueryContext,
  buildStructuredPrompt,
  tryParseJsonFromText,
  validateRequiredFields,
  buildRepairPrompt,
};

