import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractTailFromFilename,
  extractCategoryFromFilename,
  extractEntriesFromResult,
  base64ToByteSize,
  validateUploadPayload,
  resolveParseType,
  MONGODB_SAFE_SIZE,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/services/documentUploadHelpers';

// ---------------------------------------------------------------------------
// extractTailFromFilename
// ---------------------------------------------------------------------------
describe('extractTailFromFilename', () => {
  it('extracts N-number from a typical filename', () => {
    expect(extractTailFromFilename('N6196P-Airframe-Log-1.pdf')).toBe('N6196P');
  });

  it('extracts N-number with all digits', () => {
    expect(extractTailFromFilename('N12345-maintenance.pdf')).toBe('N12345');
  });

  it('extracts N-number with letters', () => {
    // Underscores are word chars in JS regex, so use hyphen separators
    expect(extractTailFromFilename('scan-N5392R-2024.pdf')).toBe('N5392R');
  });

  it('extracts N-number case-insensitively and uppercases', () => {
    expect(extractTailFromFilename('n6196p-log.pdf')).toBe('N6196P');
  });

  it('returns null when no N-number present', () => {
    expect(extractTailFromFilename('AhmedAbushagur.pdf')).toBeNull();
  });

  it('returns null for empty filename', () => {
    expect(extractTailFromFilename('')).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(extractTailFromFilename(null as any)).toBeNull();
    expect(extractTailFromFilename(undefined as any)).toBeNull();
  });

  it('extracts first N-number when multiple are present', () => {
    const result = extractTailFromFilename('N6196P-vs-N12345.pdf');
    expect(result).toBe('N6196P');
  });

  it('handles short N-numbers (N1A)', () => {
    expect(extractTailFromFilename('N1A-log.pdf')).toBe('N1A');
  });
});

// ---------------------------------------------------------------------------
// extractCategoryFromFilename
// ---------------------------------------------------------------------------
describe('extractCategoryFromFilename', () => {
  it('detects engine category', () => {
    expect(extractCategoryFromFilename('N6196P-Engine-Log.pdf')).toBe('engine');
  });

  it('detects airframe category', () => {
    expect(extractCategoryFromFilename('N6196P-Airframe-Log-1.pdf')).toBe('airframe');
  });

  it('detects propeller category', () => {
    expect(extractCategoryFromFilename('Propeller-Maintenance.pdf')).toBe('propeller');
  });

  it('detects propeller from abbreviation', () => {
    expect(extractCategoryFromFilename('prop-log-2024.pdf')).toBe('propeller');
  });

  it('detects avionics category', () => {
    expect(extractCategoryFromFilename('avionics-install-log.pdf')).toBe('avionics');
  });

  it('returns null for non-matching filenames', () => {
    expect(extractCategoryFromFilename('AhmedAbushagur.pdf')).toBeNull();
  });

  it('returns null for empty filename', () => {
    expect(extractCategoryFromFilename('')).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(extractCategoryFromFilename(null as any)).toBeNull();
    expect(extractCategoryFromFilename(undefined as any)).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(extractCategoryFromFilename('ENGINE-LOG.PDF')).toBe('engine');
    expect(extractCategoryFromFilename('AIRFRAME-maintenance.pdf')).toBe('airframe');
  });
});

// ---------------------------------------------------------------------------
// extractEntriesFromResult
// ---------------------------------------------------------------------------
describe('extractEntriesFromResult', () => {
  it('extracts entries from nested extractedData.entries', () => {
    const result = {
      data: {
        extractedData: {
          entries: [{ date: '2024-01-15', totalTime: 1.5 }],
          annualDate: '2024-01-15',
        },
      },
    };
    const entries = extractEntriesFromResult(result);
    expect(entries).toHaveLength(1);
    expect(entries[0].date).toBe('2024-01-15');
  });

  it('extracts entries when extractedData is an array directly', () => {
    const result = {
      data: {
        extractedData: [
          { date: '2024-01-15', totalTime: 1.5 },
          { date: '2024-02-20', totalTime: 2.0 },
        ],
      },
    };
    const entries = extractEntriesFromResult(result);
    expect(entries).toHaveLength(2);
  });

  it('returns empty array when extractedData is null', () => {
    expect(extractEntriesFromResult({ data: { extractedData: null } })).toEqual([]);
  });

  it('returns empty array when data is undefined', () => {
    expect(extractEntriesFromResult({})).toEqual([]);
    expect(extractEntriesFromResult({ data: undefined })).toEqual([]);
  });

  it('returns empty array when entries is empty', () => {
    const result = { data: { extractedData: { entries: [] } } };
    expect(extractEntriesFromResult(result)).toEqual([]);
  });

  it('returns empty array when extractedData is an object without entries', () => {
    const result = { data: { extractedData: { annualDate: '2024-01-15' } } };
    expect(extractEntriesFromResult(result)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// base64ToByteSize
// ---------------------------------------------------------------------------
describe('base64ToByteSize', () => {
  it('calculates correct byte size for known base64 length', () => {
    // 4 base64 chars = 3 bytes
    expect(base64ToByteSize(4)).toBe(3);
  });

  it('calculates correct byte size for larger input', () => {
    // 1000 base64 chars ≈ 750 bytes
    expect(base64ToByteSize(1000)).toBe(750);
  });

  it('returns 0 for empty input', () => {
    expect(base64ToByteSize(0)).toBe(0);
  });

  it('handles 1MB base64 string', () => {
    const oneMBBase64 = 1024 * 1024; // chars
    const result = base64ToByteSize(oneMBBase64);
    expect(result).toBe(Math.ceil((oneMBBase64 * 3) / 4));
  });
});

// ---------------------------------------------------------------------------
// validateUploadPayload
// ---------------------------------------------------------------------------
describe('validateUploadPayload', () => {
  it('returns null for valid payload', () => {
    expect(validateUploadPayload({ fileBase64: 'abc123', fileType: 'pdf' })).toBeNull();
  });

  it('returns null for valid image payload', () => {
    expect(validateUploadPayload({ fileBase64: 'abc123', fileType: 'image' })).toBeNull();
  });

  it('returns error when fileBase64 is missing', () => {
    expect(validateUploadPayload({ fileType: 'pdf' } as any)).toBe(
      'Missing required fields: fileBase64, fileType'
    );
  });

  it('returns error when fileType is missing', () => {
    expect(validateUploadPayload({ fileBase64: 'abc123' } as any)).toBe(
      'Missing required fields: fileBase64, fileType'
    );
  });

  it('returns error for invalid file type', () => {
    const result = validateUploadPayload({ fileBase64: 'abc', fileType: 'docx' });
    expect(result).toContain('Invalid file type');
  });

  it('returns error when file exceeds 50MB', () => {
    // Create a base64 string length that exceeds 50MB when decoded
    const hugeBase64Length = Math.ceil((51 * 1024 * 1024 * 4) / 3); // >50MB in bytes
    const result = validateUploadPayload({
      fileBase64: 'x'.repeat(hugeBase64Length),
      fileType: 'pdf',
    });
    expect(result).toContain('File too large');
  });
});

// ---------------------------------------------------------------------------
// resolveParseType
// ---------------------------------------------------------------------------
describe('resolveParseType', () => {
  it('maps poh to logbook for extraction', () => {
    expect(resolveParseType('poh')).toBe('logbook');
  });

  it('passes through logbook unchanged', () => {
    expect(resolveParseType('logbook')).toBe('logbook');
  });

  it('passes through maintenance unchanged', () => {
    expect(resolveParseType('maintenance')).toBe('maintenance');
  });

  it('passes through pilot_logbook unchanged', () => {
    expect(resolveParseType('pilot_logbook')).toBe('pilot_logbook');
  });

  it('passes through other unchanged', () => {
    expect(resolveParseType('other')).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe('constants', () => {
  it('MONGODB_SAFE_SIZE is 10MB', () => {
    expect(MONGODB_SAFE_SIZE).toBe(10 * 1024 * 1024);
  });

  it('MAX_FILE_SIZE_BYTES is 50MB', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(50 * 1024 * 1024);
  });
});
