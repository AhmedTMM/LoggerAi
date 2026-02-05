/**
 * Input sanitization utilities to prevent NoSQL injection and other attacks.
 */

/**
 * Sanitize a value to prevent MongoDB operator injection.
 * Strips any keys starting with `$` from objects, which are MongoDB operators.
 * This should be used on any user-supplied query parameters or body fields
 * that are passed directly to MongoDB queries.
 */
export function sanitizeMongoQuery(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeMongoQuery);
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      // Block MongoDB operators like $gt, $ne, $regex, etc.
      if (key.startsWith('$')) {
        continue;
      }
      sanitized[key] = sanitizeMongoQuery(val);
    }
    return sanitized;
  }

  return value;
}

/**
 * Sanitize a string to be safe for use in regex patterns.
 * Escapes all special regex characters.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate and sanitize a string parameter.
 * Returns the trimmed string if valid, or null if invalid/empty.
 * Limits length to prevent abuse.
 */
export function sanitizeStringParam(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}
