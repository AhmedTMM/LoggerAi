import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cn,
  getDaysUntil,
  formatDate,
  formatTime,
  formatDateTime,
  formatShortDate,
  getStatusBadgeVariant,
  getStatusLabel,
  getFlightCategoryColor,
  getCertificateLabel,
} from '@/lib/utils';

describe('cn', () => {
  it('merges simple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('merges conflicting Tailwind classes (last wins)', () => {
    // twMerge should resolve conflicts: p-4 and p-2 => p-2
    expect(cn('p-4', 'p-2')).toBe('p-2');
  });

  it('merges conflicting Tailwind text color classes', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('handles undefined and null inputs', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar');
  });

  it('handles empty arguments', () => {
    expect(cn()).toBe('');
  });

  it('handles arrays of class names', () => {
    expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz');
  });

  it('handles object-style conditional classes', () => {
    expect(cn({ 'font-bold': true, 'text-red-500': false, italic: true })).toBe('font-bold italic');
  });
});

describe('getDaysUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Set to Jan 15, 2025 at noon UTC
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns positive number for future dates', () => {
    const futureDate = new Date('2025-01-25T12:00:00Z');
    expect(getDaysUntil(futureDate)).toBe(10);
  });

  it('returns negative number for past dates', () => {
    const pastDate = new Date('2025-01-10T12:00:00Z');
    expect(getDaysUntil(pastDate)).toBe(-5);
  });

  it('returns 0 for the current day (same time)', () => {
    const today = new Date('2025-01-15T12:00:00Z');
    expect(getDaysUntil(today)).toBe(0);
  });

  it('accepts string dates', () => {
    expect(getDaysUntil('2025-01-20T12:00:00Z')).toBe(5);
  });

  it('uses Math.ceil rounding', () => {
    // 1 hour from now should round up to 1 day
    const soon = new Date('2025-01-15T13:00:00Z');
    expect(getDaysUntil(soon)).toBe(1);
  });

  it('handles dates far in the future', () => {
    const farFuture = new Date('2026-01-15T12:00:00Z');
    expect(getDaysUntil(farFuture)).toBe(365);
  });
});

describe('formatDate', () => {
  it('formats a Date object', () => {
    const date = new Date('2025-03-15T00:00:00');
    const result = formatDate(date);
    // Should contain short weekday, short month, and day
    expect(result).toMatch(/Sat/);
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/15/);
  });

  it('formats a string date', () => {
    const result = formatDate('2025-12-25T00:00:00');
    expect(result).toMatch(/Dec/);
    expect(result).toMatch(/25/);
  });

  it('returns a string', () => {
    expect(typeof formatDate(new Date())).toBe('string');
  });
});

describe('formatTime', () => {
  it('formats time from a Date object', () => {
    const date = new Date('2025-01-15T14:30:00');
    const result = formatTime(date);
    // Should contain hour and minute in 2-digit format
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it('formats time from a string date', () => {
    const result = formatTime('2025-01-15T09:05:00');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it('returns a string', () => {
    expect(typeof formatTime(new Date())).toBe('string');
  });
});

describe('formatDateTime', () => {
  it('formats date and time together without explicit time', () => {
    const date = new Date('2025-03-15T14:30:00');
    const result = formatDateTime(date);
    // Should contain the formatted date and time
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it('uses explicit time string when provided', () => {
    const date = new Date('2025-03-15T14:30:00');
    const result = formatDateTime(date, '10:00 AM');
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/15/);
    expect(result).toContain('10:00 AM');
    // Should NOT contain the auto-formatted time from the date
  });

  it('formats with string date input', () => {
    const result = formatDateTime('2025-06-20T08:00:00');
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/20/);
  });
});

describe('formatShortDate', () => {
  it('formats a short date with month, day, hour, and minute', () => {
    const date = new Date('2025-07-04T15:45:00');
    const result = formatShortDate(date);
    // Should contain short month, day, and time components
    expect(result).toMatch(/Jul/);
    expect(result).toMatch(/4/);
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it('accepts string input', () => {
    const result = formatShortDate('2025-11-28T20:00:00');
    expect(result).toMatch(/Nov/);
    expect(result).toMatch(/28/);
  });

  it('returns a string', () => {
    expect(typeof formatShortDate(new Date())).toBe('string');
  });
});

describe('getStatusBadgeVariant', () => {
  it('returns "success" for "go"', () => {
    expect(getStatusBadgeVariant('go')).toBe('success');
  });

  it('returns "warning" for "caution"', () => {
    expect(getStatusBadgeVariant('caution')).toBe('warning');
  });

  it('returns "destructive" for "no-go"', () => {
    expect(getStatusBadgeVariant('no-go')).toBe('destructive');
  });

  it('returns "secondary" for "pending"', () => {
    expect(getStatusBadgeVariant('pending')).toBe('secondary');
  });

  it('returns "secondary" for unknown status', () => {
    expect(getStatusBadgeVariant('unknown')).toBe('secondary');
    expect(getStatusBadgeVariant('')).toBe('secondary');
  });

  it('is case-sensitive (uppercase does not match)', () => {
    expect(getStatusBadgeVariant('GO')).toBe('secondary');
    expect(getStatusBadgeVariant('Caution')).toBe('secondary');
  });
});

describe('getStatusLabel', () => {
  it('returns "GO" for "go"', () => {
    expect(getStatusLabel('go')).toBe('GO');
  });

  it('returns "CAUTION" for "caution"', () => {
    expect(getStatusLabel('caution')).toBe('CAUTION');
  });

  it('returns "NO-GO" for "no-go"', () => {
    expect(getStatusLabel('no-go')).toBe('NO-GO');
  });

  it('returns "PENDING" for "pending"', () => {
    expect(getStatusLabel('pending')).toBe('PENDING');
  });

  it('returns "PENDING" for unknown values', () => {
    expect(getStatusLabel('anything')).toBe('PENDING');
    expect(getStatusLabel('')).toBe('PENDING');
  });
});

describe('getFlightCategoryColor', () => {
  it('returns green classes for VFR', () => {
    const result = getFlightCategoryColor('VFR');
    expect(result).toContain('text-green-600');
    expect(result).toContain('bg-green-50');
    expect(result).toContain('border-green-200');
  });

  it('returns blue classes for MVFR', () => {
    const result = getFlightCategoryColor('MVFR');
    expect(result).toContain('text-blue-600');
    expect(result).toContain('bg-blue-50');
    expect(result).toContain('border-blue-200');
  });

  it('returns red classes for IFR', () => {
    const result = getFlightCategoryColor('IFR');
    expect(result).toContain('text-red-600');
    expect(result).toContain('bg-red-50');
    expect(result).toContain('border-red-200');
  });

  it('returns purple classes for LIFR', () => {
    const result = getFlightCategoryColor('LIFR');
    expect(result).toContain('text-purple-600');
    expect(result).toContain('bg-purple-50');
    expect(result).toContain('border-purple-200');
  });

  it('returns zinc (neutral) classes for unknown categories', () => {
    const result = getFlightCategoryColor('UNKNOWN');
    expect(result).toContain('text-zinc-600');
    expect(result).toContain('bg-zinc-50');
    expect(result).toContain('border-zinc-200');
  });

  it('returns zinc classes for empty string', () => {
    const result = getFlightCategoryColor('');
    expect(result).toContain('text-zinc-600');
  });
});

describe('getCertificateLabel', () => {
  it('returns "Student Pilot" for "Student"', () => {
    expect(getCertificateLabel('Student')).toBe('Student Pilot');
  });

  it('returns "Private Pilot" for "PPL"', () => {
    expect(getCertificateLabel('PPL')).toBe('Private Pilot');
  });

  it('returns "Commercial Pilot" for "CPL"', () => {
    expect(getCertificateLabel('CPL')).toBe('Commercial Pilot');
  });

  it('returns "Airline Transport Pilot" for "ATP"', () => {
    expect(getCertificateLabel('ATP')).toBe('Airline Transport Pilot');
  });

  it('returns "Sport Pilot" for "Sport"', () => {
    expect(getCertificateLabel('Sport')).toBe('Sport Pilot');
  });

  it('returns the input string for unknown types', () => {
    expect(getCertificateLabel('CFI')).toBe('CFI');
    expect(getCertificateLabel('CFII')).toBe('CFII');
    expect(getCertificateLabel('MEI')).toBe('MEI');
  });

  it('is case-sensitive', () => {
    expect(getCertificateLabel('ppl')).toBe('ppl');
    expect(getCertificateLabel('student')).toBe('student');
  });

  it('returns empty string for empty input', () => {
    expect(getCertificateLabel('')).toBe('');
  });
});
