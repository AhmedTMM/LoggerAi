import { describe, it, expect } from 'vitest';
import { sanitizeMongoQuery, escapeRegex, sanitizeStringParam } from '@/lib/sanitize';

describe('sanitizeMongoQuery', () => {
  // --- Primitives pass through unchanged ---
  it('passes through null', () => {
    expect(sanitizeMongoQuery(null)).toBeNull();
  });

  it('passes through undefined', () => {
    expect(sanitizeMongoQuery(undefined)).toBeUndefined();
  });

  it('passes through strings', () => {
    expect(sanitizeMongoQuery('hello')).toBe('hello');
  });

  it('passes through numbers', () => {
    expect(sanitizeMongoQuery(42)).toBe(42);
    expect(sanitizeMongoQuery(0)).toBe(0);
    expect(sanitizeMongoQuery(-3.14)).toBe(-3.14);
  });

  it('passes through booleans', () => {
    expect(sanitizeMongoQuery(true)).toBe(true);
    expect(sanitizeMongoQuery(false)).toBe(false);
  });

  // --- $-prefixed key stripping ---
  it('strips $-prefixed keys from a flat object', () => {
    const input = { name: 'test', $gt: 100, $ne: null };
    expect(sanitizeMongoQuery(input)).toEqual({ name: 'test' });
  });

  it('strips $-prefixed keys from nested objects', () => {
    const input = {
      filter: {
        status: 'active',
        $regex: '.*admin.*',
        nested: {
          $where: 'this.isAdmin',
          valid: true,
        },
      },
    };
    const expected = {
      filter: {
        status: 'active',
        nested: {
          valid: true,
        },
      },
    };
    expect(sanitizeMongoQuery(input)).toEqual(expected);
  });

  it('returns clean objects unchanged', () => {
    const input = { name: 'John', age: 30, active: true };
    expect(sanitizeMongoQuery(input)).toEqual(input);
  });

  it('returns an empty object when all keys are $-prefixed', () => {
    const input = { $gt: 5, $lt: 10, $ne: 0 };
    expect(sanitizeMongoQuery(input)).toEqual({});
  });

  // --- Arrays ---
  it('sanitizes elements within arrays', () => {
    const input = [
      { name: 'safe', $gt: 1 },
      'hello',
      42,
      { $ne: null, ok: true },
    ];
    const expected = [{ name: 'safe' }, 'hello', 42, { ok: true }];
    expect(sanitizeMongoQuery(input)).toEqual(expected);
  });

  it('handles empty arrays', () => {
    expect(sanitizeMongoQuery([])).toEqual([]);
  });

  it('handles nested arrays', () => {
    const input = [[{ $gt: 1, val: 2 }]];
    expect(sanitizeMongoQuery(input)).toEqual([[{ val: 2 }]]);
  });

  // --- Complex injection patterns ---
  it('strips common MongoDB injection operators', () => {
    const operators = ['$gt', '$gte', '$lt', '$lte', '$ne', '$in', '$nin', '$regex', '$where', '$exists'];
    for (const op of operators) {
      const input = { [op]: 'malicious', safe: 'ok' };
      const result = sanitizeMongoQuery(input) as Record<string, unknown>;
      expect(result).not.toHaveProperty(op);
      expect(result).toHaveProperty('safe', 'ok');
    }
  });

  it('handles deeply nested injection attempts', () => {
    const input = {
      a: {
        b: {
          c: {
            $gt: 100,
            value: 'safe',
          },
        },
      },
    };
    expect(sanitizeMongoQuery(input)).toEqual({
      a: { b: { c: { value: 'safe' } } },
    });
  });

  // --- Edge cases ---
  it('handles an empty object', () => {
    expect(sanitizeMongoQuery({})).toEqual({});
  });

  it('passes through other types unchanged (e.g. functions, symbols fall to default)', () => {
    // Functions and symbols are neither primitives, arrays, nor plain objects in a way
    // that would iterate entries, so they pass through the final return.
    const fn = () => {};
    expect(sanitizeMongoQuery(fn)).toBe(fn);
  });
});

describe('escapeRegex', () => {
  it('escapes dots', () => {
    expect(escapeRegex('file.txt')).toBe('file\\.txt');
  });

  it('escapes asterisks', () => {
    expect(escapeRegex('a*b')).toBe('a\\*b');
  });

  it('escapes plus signs', () => {
    expect(escapeRegex('a+b')).toBe('a\\+b');
  });

  it('escapes question marks', () => {
    expect(escapeRegex('a?b')).toBe('a\\?b');
  });

  it('escapes caret', () => {
    expect(escapeRegex('^start')).toBe('\\^start');
  });

  it('escapes dollar sign', () => {
    expect(escapeRegex('end$')).toBe('end\\$');
  });

  it('escapes curly braces', () => {
    expect(escapeRegex('a{1,3}')).toBe('a\\{1,3\\}');
  });

  it('escapes parentheses', () => {
    expect(escapeRegex('(group)')).toBe('\\(group\\)');
  });

  it('escapes pipe', () => {
    expect(escapeRegex('a|b')).toBe('a\\|b');
  });

  it('escapes square brackets', () => {
    expect(escapeRegex('[abc]')).toBe('\\[abc\\]');
  });

  it('escapes backslashes', () => {
    expect(escapeRegex('path\\to')).toBe('path\\\\to');
  });

  it('escapes multiple special characters at once', () => {
    expect(escapeRegex('file.*(test)+[0]?')).toBe('file\\.\\*\\(test\\)\\+\\[0\\]\\?');
  });

  it('leaves normal strings unchanged', () => {
    expect(escapeRegex('hello world')).toBe('hello world');
    expect(escapeRegex('abc123')).toBe('abc123');
  });

  it('handles empty string', () => {
    expect(escapeRegex('')).toBe('');
  });

  it('produces a pattern that matches the literal string', () => {
    const special = 'price is $10.00 (USD)';
    const escaped = escapeRegex(special);
    const regex = new RegExp(escaped);
    expect(regex.test(special)).toBe(true);
    // Should NOT match a different string that would match the unescaped version
    expect(regex.test('price is 010x00 xUSDy')).toBe(false);
  });
});

describe('sanitizeStringParam', () => {
  // --- Valid strings ---
  it('returns trimmed string for a normal input', () => {
    expect(sanitizeStringParam('hello')).toBe('hello');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeStringParam('  hello  ')).toBe('hello');
    expect(sanitizeStringParam('\thello\n')).toBe('hello');
  });

  // --- Non-string inputs ---
  it('returns null for numbers', () => {
    expect(sanitizeStringParam(42)).toBeNull();
  });

  it('returns null for booleans', () => {
    expect(sanitizeStringParam(true)).toBeNull();
  });

  it('returns null for null', () => {
    expect(sanitizeStringParam(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(sanitizeStringParam(undefined)).toBeNull();
  });

  it('returns null for objects', () => {
    expect(sanitizeStringParam({ key: 'value' })).toBeNull();
  });

  it('returns null for arrays', () => {
    expect(sanitizeStringParam(['hello'])).toBeNull();
  });

  // --- Empty / whitespace-only strings ---
  it('returns null for empty string', () => {
    expect(sanitizeStringParam('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(sanitizeStringParam('   ')).toBeNull();
    expect(sanitizeStringParam('\t\n')).toBeNull();
  });

  // --- maxLength enforcement ---
  it('returns string when within default maxLength (500)', () => {
    const str = 'a'.repeat(500);
    expect(sanitizeStringParam(str)).toBe(str);
  });

  it('returns null when string exceeds default maxLength (500)', () => {
    const str = 'a'.repeat(501);
    expect(sanitizeStringParam(str)).toBeNull();
  });

  it('respects custom maxLength', () => {
    expect(sanitizeStringParam('hello', 5)).toBe('hello');
    expect(sanitizeStringParam('hello!', 5)).toBeNull();
  });

  it('returns null when trimmed length exceeds maxLength', () => {
    // "  ab  " trims to "ab" which is length 2
    expect(sanitizeStringParam('  ab  ', 2)).toBe('ab');
    expect(sanitizeStringParam('  abc  ', 2)).toBeNull();
  });

  it('handles maxLength of 1', () => {
    expect(sanitizeStringParam('a', 1)).toBe('a');
    expect(sanitizeStringParam('ab', 1)).toBeNull();
  });
});
