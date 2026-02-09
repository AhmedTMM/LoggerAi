import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mapDetectedTypeToStorageType,
  isPilotDocument,
  isAircraftDocument,
  findCachedPilotByName,
  findCachedAircraftByTail,
  suggestAttachments,
  invalidateAllCaches,
} from '@/lib/services/autoAttachService';
import type { FastDocumentClassification } from '@/lib/services/aiService';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let pilotLeanResult: Promise<any[]> = Promise.resolve([]);
let aircraftLeanResult: Promise<any[]> = Promise.resolve([]);

vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/models/Pilot', () => ({
  default: {
    find: vi.fn().mockImplementation(() => ({
      select: () => ({ lean: () => pilotLeanResult }),
    })),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/lib/models/Aircraft', () => ({
  default: {
    find: vi.fn().mockImplementation(() => ({
      select: () => ({ lean: () => aircraftLeanResult }),
    })),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setPilots(pilots: { _id: { toString: () => string }; name: string; email: string }[]) {
  pilotLeanResult = Promise.resolve(pilots);
}

function setAircraft(aircraft: { _id: { toString: () => string }; tailNumber: string }[]) {
  aircraftLeanResult = Promise.resolve(aircraft);
}

function mockId(id: string) {
  return { toString: () => id };
}

/** Build a FastDocumentClassification with sensible defaults */
function mockClassification(overrides: Partial<FastDocumentClassification> & {
  detectedType: FastDocumentClassification['detectedType'];
  confidence: number;
  suggestedName: string;
  summary: string;
}): FastDocumentClassification {
  return {
    estimatedEntryCount: 0,
    documentQuality: 'good',
    qualityNotes: [],
    isHandwritten: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('autoAttachService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateAllCaches();
    setPilots([]);
    setAircraft([]);
  });

  // =========================================================================
  // mapDetectedTypeToStorageType
  // =========================================================================
  describe('mapDetectedTypeToStorageType', () => {
    it('maps "unknown" to "other"', () => {
      expect(mapDetectedTypeToStorageType('unknown')).toBe('other');
    });

    it('passes through pilot_logbook', () => {
      expect(mapDetectedTypeToStorageType('pilot_logbook')).toBe('pilot_logbook');
    });

    it('passes through maintenance', () => {
      expect(mapDetectedTypeToStorageType('maintenance')).toBe('maintenance');
    });

    it('passes through aircraft_logbook', () => {
      expect(mapDetectedTypeToStorageType('aircraft_logbook')).toBe('aircraft_logbook');
    });

    it('passes through inspection', () => {
      expect(mapDetectedTypeToStorageType('inspection')).toBe('inspection');
    });

    it('passes through medical', () => {
      expect(mapDetectedTypeToStorageType('medical')).toBe('medical');
    });

    it('passes through other', () => {
      expect(mapDetectedTypeToStorageType('other')).toBe('other');
    });
  });

  // =========================================================================
  // isPilotDocument
  // =========================================================================
  describe('isPilotDocument', () => {
    it('returns true for pilot_logbook', () => {
      expect(isPilotDocument('pilot_logbook')).toBe(true);
    });

    it('returns true for medical', () => {
      expect(isPilotDocument('medical')).toBe(true);
    });

    it('returns true for certificate', () => {
      expect(isPilotDocument('certificate')).toBe(true);
    });

    it('returns true for endorsement', () => {
      expect(isPilotDocument('endorsement')).toBe(true);
    });

    it('returns true for checkout', () => {
      expect(isPilotDocument('checkout')).toBe(true);
    });

    it('returns false for maintenance', () => {
      expect(isPilotDocument('maintenance')).toBe(false);
    });

    it('returns false for aircraft_logbook', () => {
      expect(isPilotDocument('aircraft_logbook')).toBe(false);
    });

    it('returns false for logbook (generic)', () => {
      expect(isPilotDocument('logbook')).toBe(false);
    });

    it('returns false for other', () => {
      expect(isPilotDocument('other')).toBe(false);
    });

    it('returns false for unknown', () => {
      expect(isPilotDocument('unknown')).toBe(false);
    });
  });

  // =========================================================================
  // isAircraftDocument
  // =========================================================================
  describe('isAircraftDocument', () => {
    it('returns true for aircraft_logbook', () => {
      expect(isAircraftDocument('aircraft_logbook')).toBe(true);
    });

    it('returns true for maintenance', () => {
      expect(isAircraftDocument('maintenance')).toBe(true);
    });

    it('returns true for inspection', () => {
      expect(isAircraftDocument('inspection')).toBe(true);
    });

    it('returns true for poh', () => {
      expect(isAircraftDocument('poh')).toBe(true);
    });

    it('returns true for weight_balance', () => {
      expect(isAircraftDocument('weight_balance')).toBe(true);
    });

    it('returns true for insurance', () => {
      expect(isAircraftDocument('insurance')).toBe(true);
    });

    it('returns true for registration', () => {
      expect(isAircraftDocument('registration')).toBe(true);
    });

    it('returns true for ad_compliance', () => {
      expect(isAircraftDocument('ad_compliance')).toBe(true);
    });

    it('returns true for service_bulletin', () => {
      expect(isAircraftDocument('service_bulletin')).toBe(true);
    });

    it('returns false for pilot_logbook', () => {
      expect(isAircraftDocument('pilot_logbook')).toBe(false);
    });

    it('returns false for medical', () => {
      expect(isAircraftDocument('medical')).toBe(false);
    });

    it('returns false for other', () => {
      expect(isAircraftDocument('other')).toBe(false);
    });

    it('returns false for unknown', () => {
      expect(isAircraftDocument('unknown')).toBe(false);
    });
  });

  // =========================================================================
  // findCachedPilotByName
  // =========================================================================
  describe('findCachedPilotByName', () => {
    it('returns null for empty name', async () => {
      expect(await findCachedPilotByName('')).toBeNull();
    });

    it('returns null for single-char name', async () => {
      expect(await findCachedPilotByName('A')).toBeNull();
    });

    it('returns null for null input', async () => {
      expect(await findCachedPilotByName(null as any)).toBeNull();
    });

    it('finds pilot with exact name match', async () => {
      setPilots([{ _id: mockId('p1'), name: 'Ahmed Abushagur', email: 'a@test.com' }]);
      const result = await findCachedPilotByName('Ahmed Abushagur');
      expect(result).toEqual({ _id: 'p1', name: 'Ahmed Abushagur' });
    });

    it('finds pilot with case-insensitive match', async () => {
      setPilots([{ _id: mockId('p1'), name: 'Ahmed Abushagur', email: 'a@test.com' }]);
      const result = await findCachedPilotByName('ahmed abushagur');
      expect(result).toEqual({ _id: 'p1', name: 'Ahmed Abushagur' });
    });

    it('finds pilot when search is substring of name', async () => {
      setPilots([{ _id: mockId('p1'), name: 'Ahmed Abushagur', email: 'a@test.com' }]);
      const result = await findCachedPilotByName('Ahmed');
      expect(result).toEqual({ _id: 'p1', name: 'Ahmed Abushagur' });
    });

    it('finds pilot when name is substring of search', async () => {
      setPilots([{ _id: mockId('p1'), name: 'Ahmed', email: 'a@test.com' }]);
      const result = await findCachedPilotByName('AhmedAbushagur');
      expect(result).toEqual({ _id: 'p1', name: 'Ahmed' });
    });

    it('returns null when no pilots match', async () => {
      setPilots([{ _id: mockId('p1'), name: 'John Doe', email: 'j@test.com' }]);
      const result = await findCachedPilotByName('Ahmed');
      expect(result).toBeNull();
    });

    it('returns first matching pilot', async () => {
      setPilots([
        { _id: mockId('p1'), name: 'John Smith', email: 'j@test.com' },
        { _id: mockId('p2'), name: 'Ahmed Abushagur', email: 'a@test.com' },
      ]);
      const result = await findCachedPilotByName('Ahmed');
      expect(result).toEqual({ _id: 'p2', name: 'Ahmed Abushagur' });
    });
  });

  // =========================================================================
  // findCachedAircraftByTail
  // =========================================================================
  describe('findCachedAircraftByTail', () => {
    it('returns null for empty array', async () => {
      expect(await findCachedAircraftByTail([])).toBeNull();
    });

    it('returns null for null input', async () => {
      expect(await findCachedAircraftByTail(null as any)).toBeNull();
    });

    it('finds aircraft with exact tail match', async () => {
      setAircraft([{ _id: mockId('ac1'), tailNumber: 'N6196P' }]);
      const result = await findCachedAircraftByTail(['N6196P']);
      expect(result).toEqual({ _id: 'ac1', tailNumber: 'N6196P' });
    });

    it('finds aircraft case-insensitively', async () => {
      setAircraft([{ _id: mockId('ac1'), tailNumber: 'N6196P' }]);
      const result = await findCachedAircraftByTail(['n6196p']);
      expect(result).toEqual({ _id: 'ac1', tailNumber: 'N6196P' });
    });

    it('finds aircraft with partial tail (without N prefix)', async () => {
      setAircraft([{ _id: mockId('ac1'), tailNumber: 'N6196P' }]);
      const result = await findCachedAircraftByTail(['6196P']);
      expect(result).toEqual({ _id: 'ac1', tailNumber: 'N6196P' });
    });

    it('strips non-alphanumeric characters for matching', async () => {
      setAircraft([{ _id: mockId('ac1'), tailNumber: 'N6196P' }]);
      const result = await findCachedAircraftByTail(['N-6196-P']);
      expect(result).toEqual({ _id: 'ac1', tailNumber: 'N6196P' });
    });

    it('returns first matching tail from multiple candidates', async () => {
      setAircraft([
        { _id: mockId('ac1'), tailNumber: 'N12345' },
        { _id: mockId('ac2'), tailNumber: 'N6196P' },
      ]);
      const result = await findCachedAircraftByTail(['N6196P', 'N12345']);
      expect(result).toEqual({ _id: 'ac2', tailNumber: 'N6196P' });
    });

    it('returns null when no aircraft match', async () => {
      setAircraft([{ _id: mockId('ac1'), tailNumber: 'N12345' }]);
      const result = await findCachedAircraftByTail(['N99999']);
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // suggestAttachments
  // =========================================================================
  describe('suggestAttachments', () => {
    it('links pilot_logbook to pilot when pilot name matches', async () => {
      setPilots([{ _id: mockId('p1'), name: 'Ahmed Abushagur', email: 'a@test.com' }]);

      const result = await suggestAttachments(mockClassification({
        detectedType: 'pilot_logbook',
        confidence: 0.9,
        pilotName: 'Ahmed Abushagur',
        aircraftTailNumbers: ['N6196P'],
        suggestedName: 'logbook.pdf',
        summary: 'Pilot logbook',
      }));

      expect(result.suggestedPilotId).toBe('p1');
      expect(result.suggestedPilotName).toBe('Ahmed Abushagur');
      // Pilot logbooks should NOT attach to aircraft
      expect(result.suggestedAircraftId).toBeUndefined();
      expect(result.attachmentConfidence).toBeGreaterThan(0);
    });

    it('links maintenance doc to aircraft when tail matches', async () => {
      setAircraft([{ _id: mockId('ac1'), tailNumber: 'N6196P' }]);

      const result = await suggestAttachments(mockClassification({
        detectedType: 'maintenance',
        confidence: 0.9,
        aircraftTailNumbers: ['N6196P'],
        suggestedName: 'maintenance.pdf',
        summary: 'Maintenance log',
      }));

      expect(result.suggestedAircraftId).toBe('ac1');
      expect(result.suggestedAircraftTail).toBe('N6196P');
      // Aircraft docs should NOT attach to pilot
      expect(result.suggestedPilotId).toBeUndefined();
      expect(result.attachmentConfidence).toBeGreaterThan(0);
    });

    it('returns no match when nothing found', async () => {
      const result = await suggestAttachments(mockClassification({
        detectedType: 'other',
        confidence: 0.5,
        suggestedName: 'random.pdf',
        summary: 'Unknown document',
      }));

      expect(result.suggestedPilotId).toBeUndefined();
      expect(result.suggestedAircraftId).toBeUndefined();
      expect(result.attachmentConfidence).toBe(0);
      expect(result.attachmentReason).toContain('No matching');
    });

    it('uses matchedPilotName over pilotName when available', async () => {
      setPilots([
        { _id: mockId('p1'), name: 'Ahmed A', email: 'a@test.com' },
        { _id: mockId('p2'), name: 'Ahmed Abushagur', email: 'b@test.com' },
      ]);

      const result = await suggestAttachments(mockClassification({
        detectedType: 'pilot_logbook',
        confidence: 0.9,
        pilotName: 'Ahmed',
        matchedPilotName: 'Ahmed Abushagur',
        suggestedName: 'logbook.pdf',
        summary: 'Pilot logbook',
      }));

      expect(result.suggestedPilotId).toBe('p2');
    });

    it('uses matchedAircraftTails over aircraftTailNumbers when available', async () => {
      setAircraft([
        { _id: mockId('ac1'), tailNumber: 'N12345' },
        { _id: mockId('ac2'), tailNumber: 'N6196P' },
      ]);

      const result = await suggestAttachments(mockClassification({
        detectedType: 'maintenance',
        confidence: 0.9,
        aircraftTailNumbers: ['N12345'],
        matchedAircraftTails: ['N6196P'],
        suggestedName: 'maint.pdf',
        summary: 'Maintenance log',
      }));

      expect(result.suggestedAircraftId).toBe('ac2');
    });

    it('sets correct documentType from classification', async () => {
      const result = await suggestAttachments(mockClassification({
        detectedType: 'unknown',
        confidence: 0.5,
        suggestedName: 'doc.pdf',
        summary: 'Unknown',
      }));

      expect(result.documentType).toBe('other');
    });

    it('links generic doc to pilot when pilot found but not pilot-specific', async () => {
      setPilots([{ _id: mockId('p1'), name: 'Ahmed', email: 'a@test.com' }]);

      const result = await suggestAttachments(mockClassification({
        detectedType: 'logbook',
        confidence: 0.8,
        pilotName: 'Ahmed',
        suggestedName: 'doc.pdf',
        summary: 'A logbook',
      }));

      // Generic doc with pilot match gets 0.8 confidence penalty
      expect(result.suggestedPilotId).toBe('p1');
      expect(result.attachmentConfidence).toBeLessThan(0.8);
    });

    it('links generic doc to aircraft when aircraft found but not aircraft-specific', async () => {
      setAircraft([{ _id: mockId('ac1'), tailNumber: 'N6196P' }]);

      const result = await suggestAttachments(mockClassification({
        detectedType: 'logbook',
        confidence: 0.8,
        aircraftTailNumbers: ['N6196P'],
        suggestedName: 'doc.pdf',
        summary: 'A logbook',
      }));

      // Generic doc with aircraft match gets 0.8 penalty
      expect(result.suggestedAircraftId).toBe('ac1');
      expect(result.attachmentConfidence).toBeLessThan(0.8);
    });

    it('confidence is product of match confidence and classification confidence', async () => {
      setPilots([{ _id: mockId('p1'), name: 'Ahmed Abushagur', email: 'a@test.com' }]);

      const result = await suggestAttachments(mockClassification({
        detectedType: 'pilot_logbook',
        confidence: 0.8,
        pilotName: 'Ahmed Abushagur',
        suggestedName: 'logbook.pdf',
        summary: 'Logbook',
      }));

      // Exact match gives 1.0 pilot confidence * 0.8 classification confidence
      expect(result.attachmentConfidence).toBeCloseTo(0.8, 1);
    });
  });
});
