import { describe, it, expect } from 'vitest';
import { DOCUMENT_TYPE_META, type DocumentType } from '@/lib/documentTypes';

const ALL_DOCUMENT_TYPES: DocumentType[] = [
  'pilot_logbook',
  'aircraft_logbook',
  'maintenance',
  'inspection',
  'poh',
  'weight_balance',
  'insurance',
  'registration',
  'medical',
  'certificate',
  'endorsement',
  'checkout',
  'ad_compliance',
  'service_bulletin',
  'logbook',
  'other',
];

describe('DOCUMENT_TYPE_META', () => {
  it('has metadata for every DocumentType', () => {
    for (const type of ALL_DOCUMENT_TYPES) {
      expect(DOCUMENT_TYPE_META).toHaveProperty(type);
    }
  });

  it('contains exactly the expected number of document types', () => {
    expect(Object.keys(DOCUMENT_TYPE_META).length).toBe(ALL_DOCUMENT_TYPES.length);
  });

  describe('required metadata fields', () => {
    for (const type of ALL_DOCUMENT_TYPES) {
      describe(`${type}`, () => {
        it('has a non-empty label', () => {
          const meta = DOCUMENT_TYPE_META[type];
          expect(meta.label).toBeDefined();
          expect(typeof meta.label).toBe('string');
          expect(meta.label.length).toBeGreaterThan(0);
        });

        it('has a valid category', () => {
          const meta = DOCUMENT_TYPE_META[type];
          expect(meta.category).toBeDefined();
          expect(['pilot', 'aircraft', 'general']).toContain(meta.category);
        });

        it('has a non-empty color', () => {
          const meta = DOCUMENT_TYPE_META[type];
          expect(meta.color).toBeDefined();
          expect(typeof meta.color).toBe('string');
          expect(meta.color.length).toBeGreaterThan(0);
        });

        it('has a non-empty description', () => {
          const meta = DOCUMENT_TYPE_META[type];
          expect(meta.description).toBeDefined();
          expect(typeof meta.description).toBe('string');
          expect(meta.description.length).toBeGreaterThan(0);
        });
      });
    }
  });

  // --- Specific metadata lookups ---
  it('returns correct metadata for pilot_logbook', () => {
    const meta = DOCUMENT_TYPE_META['pilot_logbook'];
    expect(meta.label).toBe('Pilot Logbook');
    expect(meta.category).toBe('pilot');
    expect(meta.color).toBe('blue');
    expect(meta.description).toBe('Personal flight records');
  });

  it('returns correct metadata for aircraft_logbook', () => {
    const meta = DOCUMENT_TYPE_META['aircraft_logbook'];
    expect(meta.label).toBe('Aircraft Logbook');
    expect(meta.category).toBe('aircraft');
    expect(meta.color).toBe('indigo');
    expect(meta.description).toBe('Aircraft flight records');
  });

  it('returns correct metadata for maintenance', () => {
    const meta = DOCUMENT_TYPE_META['maintenance'];
    expect(meta.label).toBe('Maintenance');
    expect(meta.category).toBe('aircraft');
    expect(meta.color).toBe('amber');
  });

  it('returns correct metadata for inspection', () => {
    const meta = DOCUMENT_TYPE_META['inspection'];
    expect(meta.label).toBe('Inspection');
    expect(meta.category).toBe('aircraft');
    expect(meta.color).toBe('orange');
  });

  it('returns correct metadata for poh', () => {
    const meta = DOCUMENT_TYPE_META['poh'];
    expect(meta.label).toBe('POH');
    expect(meta.category).toBe('aircraft');
    expect(meta.color).toBe('purple');
  });

  it('returns correct metadata for medical', () => {
    const meta = DOCUMENT_TYPE_META['medical'];
    expect(meta.label).toBe('Medical');
    expect(meta.category).toBe('pilot');
    expect(meta.color).toBe('rose');
  });

  it('returns correct metadata for certificate', () => {
    const meta = DOCUMENT_TYPE_META['certificate'];
    expect(meta.label).toBe('Certificate');
    expect(meta.category).toBe('pilot');
    expect(meta.color).toBe('violet');
  });

  it('returns correct metadata for ad_compliance', () => {
    const meta = DOCUMENT_TYPE_META['ad_compliance'];
    expect(meta.label).toBe('AD Compliance');
    expect(meta.category).toBe('aircraft');
    expect(meta.color).toBe('red');
    expect(meta.description).toBe('Airworthiness Directives');
  });

  it('returns correct metadata for service_bulletin', () => {
    const meta = DOCUMENT_TYPE_META['service_bulletin'];
    expect(meta.label).toBe('Service Bulletin');
    expect(meta.category).toBe('aircraft');
    expect(meta.color).toBe('yellow');
  });

  it('returns correct metadata for logbook (legacy)', () => {
    const meta = DOCUMENT_TYPE_META['logbook'];
    expect(meta.label).toBe('Logbook');
    expect(meta.category).toBe('general');
    expect(meta.color).toBe('blue');
  });

  it('returns correct metadata for other', () => {
    const meta = DOCUMENT_TYPE_META['other'];
    expect(meta.label).toBe('Other');
    expect(meta.category).toBe('general');
    expect(meta.color).toBe('gray');
  });

  // --- Category grouping validation ---
  it('has correct pilot-category documents', () => {
    const pilotTypes = Object.entries(DOCUMENT_TYPE_META)
      .filter(([, meta]) => meta.category === 'pilot')
      .map(([type]) => type);

    expect(pilotTypes).toContain('pilot_logbook');
    expect(pilotTypes).toContain('medical');
    expect(pilotTypes).toContain('certificate');
    expect(pilotTypes).toContain('endorsement');
    expect(pilotTypes).toContain('checkout');
  });

  it('has correct aircraft-category documents', () => {
    const aircraftTypes = Object.entries(DOCUMENT_TYPE_META)
      .filter(([, meta]) => meta.category === 'aircraft')
      .map(([type]) => type);

    expect(aircraftTypes).toContain('aircraft_logbook');
    expect(aircraftTypes).toContain('maintenance');
    expect(aircraftTypes).toContain('inspection');
    expect(aircraftTypes).toContain('poh');
    expect(aircraftTypes).toContain('weight_balance');
    expect(aircraftTypes).toContain('insurance');
    expect(aircraftTypes).toContain('registration');
    expect(aircraftTypes).toContain('ad_compliance');
    expect(aircraftTypes).toContain('service_bulletin');
  });

  it('has correct general-category documents', () => {
    const generalTypes = Object.entries(DOCUMENT_TYPE_META)
      .filter(([, meta]) => meta.category === 'general')
      .map(([type]) => type);

    expect(generalTypes).toContain('logbook');
    expect(generalTypes).toContain('other');
  });

  // --- Uniqueness checks ---
  it('has unique labels for each document type', () => {
    const labels = Object.values(DOCUMENT_TYPE_META).map(m => m.label);
    const uniqueLabels = new Set(labels);
    expect(uniqueLabels.size).toBe(labels.length);
  });
});
