/**
 * JSON Repair Utility
 * Handles truncated, malformed, and incomplete JSON from AI responses
 */

export interface RepairResult {
  success: boolean;
  data: any;
  entriesRecovered: number;
  wasRepaired: boolean;
  repairMethod?: string;
}

/**
 * Attempts to repair and parse potentially malformed JSON
 * Handles common AI output issues like truncation, missing brackets, etc.
 */
export function repairAndParseJSON(text: string): RepairResult {
  // Clean up common issues first
  let cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Strategy 1: Try direct parse first
  try {
    const parsed = JSON.parse(cleaned);
    return {
      success: true,
      data: normalizeResult(parsed),
      entriesRecovered: countEntries(parsed),
      wasRepaired: false,
    };
  } catch {
    // Continue to repair strategies
  }

  // Strategy 2: Find and parse complete JSON object/array
  const jsonMatch = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        success: true,
        data: normalizeResult(parsed),
        entriesRecovered: countEntries(parsed),
        wasRepaired: true,
        repairMethod: 'extracted-complete-json',
      };
    } catch {
      // Continue
    }
  }

  // Strategy 3: Try to close unclosed brackets/braces
  const repaired = tryCloseJSON(cleaned);
  if (repaired) {
    try {
      const parsed = JSON.parse(repaired);
      return {
        success: true,
        data: normalizeResult(parsed),
        entriesRecovered: countEntries(parsed),
        wasRepaired: true,
        repairMethod: 'closed-brackets',
      };
    } catch {
      // Continue
    }
  }

  // Strategy 4: Extract individual complete entries using brace counting
  const entries = extractCompleteEntries(cleaned);
  if (entries.length > 0) {
    // Also try to extract top-level fields
    const topLevelFields = extractTopLevelFields(cleaned);

    return {
      success: true,
      data: { entries, ...topLevelFields },
      entriesRecovered: entries.length,
      wasRepaired: true,
      repairMethod: 'brace-counting',
    };
  }

  // Strategy 5: Try to parse as NDJSON (newline-delimited JSON)
  const ndjsonEntries = tryParseNDJSON(cleaned);
  if (ndjsonEntries.length > 0) {
    return {
      success: true,
      data: { entries: ndjsonEntries },
      entriesRecovered: ndjsonEntries.length,
      wasRepaired: true,
      repairMethod: 'ndjson',
    };
  }

  // Strategy 6: Last resort - extract any JSON-like objects
  const anyObjects = extractAnyJSONObjects(cleaned);
  if (anyObjects.length > 0) {
    return {
      success: true,
      data: { entries: anyObjects },
      entriesRecovered: anyObjects.length,
      wasRepaired: true,
      repairMethod: 'regex-extraction',
    };
  }

  return {
    success: false,
    data: { entries: [] },
    entriesRecovered: 0,
    wasRepaired: false,
  };
}

/**
 * Try to close unclosed brackets and braces
 */
function tryCloseJSON(text: string): string | null {
  let bracketCount = 0;
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (const char of text) {
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '[') bracketCount++;
      else if (char === ']') bracketCount--;
      else if (char === '{') braceCount++;
      else if (char === '}') braceCount--;
    }
  }

  // If we're in a string, close it first
  let result = text;
  if (inString) {
    result += '"';
  }

  // Remove trailing comma if present (common in truncated JSON)
  result = result.replace(/,\s*$/, '');

  // Close any unclosed braces/brackets
  while (braceCount > 0) {
    result += '}';
    braceCount--;
  }
  while (bracketCount > 0) {
    result += ']';
    bracketCount--;
  }

  return result !== text ? result : null;
}

/**
 * Extract complete JSON entries using brace counting
 * Handles truncated arrays where some entries are complete
 */
function extractCompleteEntries(text: string): any[] {
  // Find the start of entries array
  const entriesMatch = text.match(/"entries"\s*:\s*\[([\s\S]*)/);
  const arrayStart = text.match(/^\s*\[([\s\S]*)/);
  const entriesText = entriesMatch ? entriesMatch[1] : (arrayStart ? arrayStart[1] : null);

  if (!entriesText) {
    // Try to find any array content
    const anyArray = text.match(/\[\s*([\s\S]*)/);
    if (!anyArray) return [];
    return extractObjectsFromText(anyArray[1]);
  }

  return extractObjectsFromText(entriesText);
}

/**
 * Extract complete JSON objects from text using brace counting
 */
function extractObjectsFromText(text: string): any[] {
  const completeEntries: any[] = [];
  let currentEntry = '';
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  let foundStart = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      currentEntry += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      currentEntry += char;
      continue;
    }

    if (char === '"') {
      inString = !inString;
    }

    if (!inString) {
      if (char === '{') {
        if (!foundStart) foundStart = true;
        braceCount++;
      } else if (char === '}') {
        braceCount--;
      }
    }

    if (foundStart) {
      currentEntry += char;
    }

    if (foundStart && braceCount === 0 && currentEntry.trim().length > 0) {
      // We have a complete entry
      try {
        const entry = JSON.parse(currentEntry.trim());
        // Validate it looks like a real entry (has date or description)
        if (entry.date || entry.description || entry.aircraftIdent || entry.totalTime) {
          completeEntries.push(entry);
        }
      } catch {
        // Skip malformed entry
      }
      currentEntry = '';
      foundStart = false;
    }
  }

  return completeEntries;
}

/**
 * Try to parse as newline-delimited JSON
 */
function tryParseNDJSON(text: string): any[] {
  const entries: any[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const obj = JSON.parse(trimmed);
        if (obj.date || obj.description) {
          entries.push(obj);
        }
      } catch {
        // Skip
      }
    }
  }

  return entries;
}

/**
 * Extract any JSON-like objects using regex (last resort)
 */
function extractAnyJSONObjects(text: string): any[] {
  const entries: any[] = [];

  // Match simple JSON objects with date field
  const objectPattern = /\{[^{}]*"date"\s*:\s*"[^"]+(?:"[^{}]*)*\}/g;
  const matches = text.match(objectPattern) || [];

  for (const match of matches) {
    try {
      // Try to fix common issues
      let fixed = match
        .replace(/,\s*}/g, '}')  // Remove trailing comma
        .replace(/:\s*,/g, ': null,');  // Fix empty values

      const obj = JSON.parse(fixed);
      if (obj.date) {
        entries.push(obj);
      }
    } catch {
      // Skip
    }
  }

  return entries;
}

/**
 * Extract top-level fields from partially parsed JSON
 */
function extractTopLevelFields(text: string): Record<string, any> {
  const fields: Record<string, any> = {};

  // Common maintenance log fields
  const patterns = [
    { key: 'annualDate', pattern: /"annualDate"\s*:\s*"([^"]+)"/ },
    { key: 'hundredHourDate', pattern: /"hundredHourDate"\s*:\s*"([^"]+)"/ },
    { key: 'transponderDate', pattern: /"transponderDate"\s*:\s*"([^"]+)"/ },
    { key: 'staticDate', pattern: /"staticDate"\s*:\s*"([^"]+)"/ },
    { key: 'eltDate', pattern: /"eltDate"\s*:\s*"([^"]+)"/ },
    { key: 'currentTach', pattern: /"currentTach"\s*:\s*([0-9.]+)/ },
    { key: 'currentHobbs', pattern: /"currentHobbs"\s*:\s*([0-9.]+)/ },
    { key: 'aircraftIdent', pattern: /"aircraftIdent"\s*:\s*"([^"]+)"/ },
  ];

  for (const { key, pattern } of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1];
      fields[key] = key.includes('Date') || key === 'aircraftIdent'
        ? value
        : parseFloat(value);
    }
  }

  return fields;
}

/**
 * Normalize the result to always have entries array
 */
function normalizeResult(parsed: any): { entries: any[] } & Record<string, any> {
  if (Array.isArray(parsed)) {
    return { entries: parsed };
  }

  if (parsed.entries && Array.isArray(parsed.entries)) {
    return parsed;
  }

  if (parsed.flights && Array.isArray(parsed.flights)) {
    const { flights, ...rest } = parsed;
    return { entries: flights, ...rest };
  }

  // Single object
  return { entries: [parsed] };
}

/**
 * Count entries in parsed result
 */
function countEntries(parsed: any): number {
  if (Array.isArray(parsed)) return parsed.length;
  if (parsed.entries) return parsed.entries.length;
  if (parsed.flights) return parsed.flights.length;
  return 1;
}
