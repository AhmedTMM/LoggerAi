import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  updatePilotExperience,
  updateAircraftFromEntries,
} from '@/lib/services/documentProcessingUtils';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPilotSave = vi.fn().mockResolvedValue(undefined);
const mockAircraftSave = vi.fn().mockResolvedValue(undefined);

const mockPilotFindById = vi.fn();
const mockAircraftFindById = vi.fn();

vi.mock('@/lib/models/Pilot', () => ({
  default: {
    findById: (...args: any[]) => mockPilotFindById(...args),
  },
}));

vi.mock('@/lib/models/Aircraft', () => ({
  default: {
    findById: (...args: any[]) => mockAircraftFindById(...args),
  },
  LogbookCategory: {},
}));

vi.mock('@/lib/services/safetyAnalysisService', () => ({
  generateSafetyAnalysis: vi.fn().mockReturnValue({
    lastAnalyzed: new Date(),
    score: 85,
    findings: [],
  }),
}));

vi.mock('@/lib/services/autoAttachService', () => ({
  invalidateAllCaches: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockPilotDoc() {
  const pilot: any = {
    flightEntries: [],
    experience: {},
    save: mockPilotSave.mockImplementation(function (this: any) {
      return Promise.resolve();
    }),
  };
  // Allow save to capture `this`
  pilot.save = vi.fn().mockImplementation(() => Promise.resolve());
  return pilot;
}

function createMockAircraftDoc(overrides: Record<string, any> = {}) {
  const ac: any = {
    maintenanceDates: {
      annual: new Date('2023-01-01'),
      transponder: new Date('2023-01-01'),
      staticSystem: new Date('2023-01-01'),
    },
    airworthinessStatus: {},
    currentHours: { hobbs: 1000, tach: 950 },
    logs: [],
    logbooks: { engine: [], airframe: [], propeller: [], avionics: [] },
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return ac;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('updatePilotExperience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when pilot not found', async () => {
    mockPilotFindById.mockResolvedValue(null);
    await updatePilotExperience('nonexistent', []);
    // No save should be called
    expect(mockPilotSave).not.toHaveBeenCalled();
  });

  it('normalizes entries and sets flightEntries on pilot', async () => {
    const pilot = createMockPilotDoc();
    mockPilotFindById.mockResolvedValue(pilot);

    const entries = [
      {
        date: '2024-01-15',
        aircraftIdent: 'N12345',
        aircraftType: 'C172',
        from: 'KLAX',
        to: 'KSFO',
        totalTime: 3.5,
        pic: 3.5,
        night: 1.0,
        actualInstrument: 0.5,
        crossCountry: 3.5,
      },
    ];

    await updatePilotExperience('pilot1', entries);

    expect(pilot.save).toHaveBeenCalled();
    expect(pilot.flightEntries).toHaveLength(1);
    expect(pilot.flightEntries[0].aircraftIdent).toBe('N12345');
    expect(pilot.flightEntries[0].from).toBe('KLAX');
    expect(pilot.flightEntries[0].to).toBe('KSFO');
  });

  it('filters entries without date', async () => {
    const pilot = createMockPilotDoc();
    mockPilotFindById.mockResolvedValue(pilot);

    const entries = [
      { date: '2024-01-15', aircraftIdent: 'N12345', totalTime: 1.5 },
      { date: '', aircraftIdent: 'N12345', totalTime: 2.0 },
    ];

    await updatePilotExperience('pilot1', entries);

    expect(pilot.flightEntries).toHaveLength(1);
  });

  it('filters entries without aircraftIdent', async () => {
    const pilot = createMockPilotDoc();
    mockPilotFindById.mockResolvedValue(pilot);

    const entries = [
      { date: '2024-01-15', aircraftIdent: 'N12345', totalTime: 1.5 },
      { date: '2024-01-20', aircraftIdent: '', totalTime: 1.0 },
      { date: '2024-01-25', totalTime: 3.0 },
    ];

    await updatePilotExperience('pilot1', entries);

    expect(pilot.flightEntries).toHaveLength(1);
    expect(pilot.flightEntries[0].totalTime).toBe(1.5);
  });

  it('uses "aircraft" fallback for missing aircraftIdent', async () => {
    const pilot = createMockPilotDoc();
    mockPilotFindById.mockResolvedValue(pilot);

    const entries = [
      { date: '2024-01-15', aircraft: 'N67890', totalTime: 2.0 },
    ];

    await updatePilotExperience('pilot1', entries);

    expect(pilot.flightEntries).toHaveLength(1);
    expect(pilot.flightEntries[0].aircraftIdent).toBe('N67890');
  });

  it('aggregates total hours correctly', async () => {
    const pilot = createMockPilotDoc();
    mockPilotFindById.mockResolvedValue(pilot);

    const entries = [
      { date: '2024-01-15', aircraftIdent: 'N12345', totalTime: 3.5, pic: 3.5, night: 1.0, actualInstrument: 0.5, simulatedInstrument: 0.3, crossCountry: 3.5 },
      { date: '2024-02-20', aircraftIdent: 'N12345', totalTime: 2.0, pic: 2.0, night: 0.5, actualInstrument: 0, simulatedInstrument: 0, crossCountry: 2.0 },
    ];

    await updatePilotExperience('pilot1', entries);

    expect(pilot.experience.totalHours).toBe(5.5);
    expect(pilot.experience.picHours).toBe(5.5);
    expect(pilot.experience.nightHours).toBe(1.5);
    expect(pilot.experience.ifrHours).toBe(0.8); // 0.5 actual + 0.3 simulated
    expect(pilot.experience.crossCountryHours).toBe(5.5);
  });

  it('handles wrapped { flights: [...] } format', async () => {
    const pilot = createMockPilotDoc();
    mockPilotFindById.mockResolvedValue(pilot);

    const entries = [
      {
        flights: [
          { date: '2024-01-15', aircraftIdent: 'N12345', totalTime: 1.5 },
          { date: '2024-02-20', aircraftIdent: 'N12345', totalTime: 2.0 },
        ],
      },
    ];

    await updatePilotExperience('pilot1', entries);

    expect(pilot.flightEntries).toHaveLength(2);
    expect(pilot.experience.totalHours).toBe(3.5);
  });

  it('computes recent hours (last 30 days, last 90 days)', async () => {
    const pilot = createMockPilotDoc();
    mockPilotFindById.mockResolvedValue(pilot);

    const now = new Date();
    const recentDate = new Date(now.getTime() - 15 * 86400000).toISOString().split('T')[0]; // 15 days ago
    const midDate = new Date(now.getTime() - 60 * 86400000).toISOString().split('T')[0];   // 60 days ago
    const oldDate = new Date(now.getTime() - 120 * 86400000).toISOString().split('T')[0];   // 120 days ago

    const entries = [
      { date: recentDate, aircraftIdent: 'N12345', totalTime: 2.0 },
      { date: midDate, aircraftIdent: 'N12345', totalTime: 3.0 },
      { date: oldDate, aircraftIdent: 'N12345', totalTime: 5.0 },
    ];

    await updatePilotExperience('pilot1', entries);

    expect(pilot.experience.totalHours).toBe(10.0);
    expect(pilot.experience.last30DaysHours).toBe(2.0);
    expect(pilot.experience.last90DaysHours).toBe(5.0); // recent + mid
  });

  it('replaces (not appends) flightEntries and experience', async () => {
    const pilot = createMockPilotDoc();
    pilot.flightEntries = [{ date: '2020-01-01', aircraftIdent: 'OLD', totalTime: 100 }];
    pilot.experience = { totalHours: 100 };
    mockPilotFindById.mockResolvedValue(pilot);

    const entries = [
      { date: '2024-01-15', aircraftIdent: 'N12345', totalTime: 1.5 },
    ];

    await updatePilotExperience('pilot1', entries);

    // Old data replaced, not appended
    expect(pilot.flightEntries).toHaveLength(1);
    expect(pilot.flightEntries[0].aircraftIdent).toBe('N12345');
    expect(pilot.experience.totalHours).toBe(1.5);
  });

  it('maps landingsFullStopDay/Night to landingsDay/Night', async () => {
    const pilot = createMockPilotDoc();
    mockPilotFindById.mockResolvedValue(pilot);

    const entries = [
      {
        date: '2024-01-15',
        aircraftIdent: 'N12345',
        totalTime: 1.0,
        landingsFullStopDay: 3,
        landingsFullStopNight: 2,
      },
    ];

    await updatePilotExperience('pilot1', entries);

    expect(pilot.flightEntries[0].landingsDay).toBe(3);
    expect(pilot.flightEntries[0].landingsNight).toBe(2);
  });
});

// =========================================================================
// updateAircraftFromEntries
// =========================================================================

describe('updateAircraftFromEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when aircraft not found', async () => {
    mockAircraftFindById.mockResolvedValue(null);
    await updateAircraftFromEntries('nonexistent', []);
    expect(mockAircraftSave).not.toHaveBeenCalled();
  });

  it('extracts annual inspection date from structured inspectionType', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-06-15', description: 'Full inspection', isInspection: true, inspectionType: 'annual' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.save).toHaveBeenCalled();
    expect(ac.maintenanceDates.annual.toISOString()).toContain('2024-06-15');
    expect(ac.airworthinessStatus.annual.toISOString()).toContain('2024-06-15');
  });

  it('extracts annual from description keyword "annual"', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-03-18', description: 'Performed Annual Inspection per 14 CFR 43' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.maintenanceDates.annual.toISOString()).toContain('2024-03-18');
  });

  it('extracts transponder date from description keyword', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-08-20', description: 'Transponder check per 91.413' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.maintenanceDates.transponder.toISOString()).toContain('2024-08-20');
    expect(ac.airworthinessStatus.transponder.toISOString()).toContain('2024-08-20');
  });

  it('extracts static system date from description keyword', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-09-01', description: 'Static system and altimeter check per 91.411' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.maintenanceDates.staticSystem.toISOString()).toContain('2024-09-01');
    expect(ac.airworthinessStatus.staticSystem.toISOString()).toContain('2024-09-01');
  });

  it('extracts 100-hour inspection from "100 hour" keyword', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-05-01', description: '100 hour inspection completed' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.maintenanceDates.hundredHour.toISOString()).toContain('2024-05-01');
    expect(ac.airworthinessStatus.hundredHour.toISOString()).toContain('2024-05-01');
  });

  it('extracts 100-hour from "100hr" variant', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-05-15', description: '100hr inspection - no defects' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.maintenanceDates.hundredHour.toISOString()).toContain('2024-05-15');
  });

  it('extracts ELT date from description', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-04-10', description: 'ELT battery replacement and test' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.airworthinessStatus.elt.toISOString()).toContain('2024-04-10');
  });

  it('extracts ELT from "emergency locator" keyword', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-07-20', description: 'Emergency locator transmitter inspection' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.airworthinessStatus.elt.toISOString()).toContain('2024-07-20');
  });

  it('updates max hobbs and tach from entries', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-01-15', description: 'Oil change', hobbsTime: 1100, tachTime: 1050 },
      { date: '2024-02-20', description: 'Annual', hobbsTime: 1200, tachTime: 1150 },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.currentHours.hobbs).toBe(1200);
    expect(ac.currentHours.tach).toBe(1150);
  });

  it('does not reduce existing hobbs/tach', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-01-15', description: 'Old entry', hobbsTime: 500, tachTime: 450 },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.currentHours.hobbs).toBe(1000); // unchanged
    expect(ac.currentHours.tach).toBe(950);   // unchanged
  });

  it('categorizes log entries into correct logbooks', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-01-15', description: 'Engine overhaul completed' },
      { date: '2024-02-20', description: 'Propeller balance and inspection' },
      { date: '2024-03-10', description: 'Transponder check per 91.413' },
      { date: '2024-04-01', description: 'Wing skin repair' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.logbooks.engine).toHaveLength(1);
    expect(ac.logbooks.propeller).toHaveLength(1);
    expect(ac.logbooks.avionics).toHaveLength(1);
    expect(ac.logbooks.airframe).toHaveLength(1);
    expect(ac.logs).toHaveLength(4);
  });

  it('uses filenameCategory override for all entries', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-01-15', description: 'Some work' },
      { date: '2024-02-20', description: 'More work' },
    ];

    await updateAircraftFromEntries('ac1', entries, 'engine');

    expect(ac.logbooks.engine).toHaveLength(2);
    expect(ac.logbooks.airframe).toHaveLength(0);
  });

  it('filters out entries with only "Maintenance entry" default description', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-01-15' },  // no description → "Maintenance entry" → filtered
      { date: '2024-02-20', description: 'Oil change' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.logs).toHaveLength(1);
    expect(ac.logs[0].description).toBe('Oil change');
  });

  it('uses workPerformed fallback for description', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-01-15', workPerformed: 'Replaced exhaust gaskets' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.logs).toHaveLength(1);
    expect(ac.logs[0].description).toBe('Replaced exhaust gaskets');
  });

  it('sets userId on aircraft if not already set', async () => {
    const ac = createMockAircraftDoc({ userId: undefined });
    mockAircraftFindById.mockResolvedValue(ac);

    await updateAircraftFromEntries('ac1', [], undefined, 'user123');

    expect(ac.userId).toBe('user123');
  });

  it('does not overwrite existing userId', async () => {
    const ac = createMockAircraftDoc({ userId: 'existing-user' });
    mockAircraftFindById.mockResolvedValue(ac);

    await updateAircraftFromEntries('ac1', [], undefined, 'new-user');

    expect(ac.userId).toBe('existing-user');
  });

  it('picks latest inspection date when multiple entries reference same type', async () => {
    const ac = createMockAircraftDoc({
      maintenanceDates: { annual: new Date('2022-01-01'), transponder: new Date('2023-01-01'), staticSystem: new Date('2023-01-01') },
    });
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2023-06-15', description: 'Annual inspection' },
      { date: '2024-06-20', description: 'Annual inspection' },
      { date: '2024-01-10', description: 'Annual inspection' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.maintenanceDates.annual.toISOString()).toContain('2024-06-20');
  });

  it('captures mechanic/signedBy in log entries', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-01-15', description: 'Oil change', mechanic: 'John Smith A&P' },
      { date: '2024-02-20', description: 'Prop balance', signedBy: 'Jane Doe IA' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.logs[0].mechanic).toBe('John Smith A&P');
    expect(ac.logs[1].mechanic).toBe('Jane Doe IA');
  });

  it('initializes logbooks if not present', async () => {
    const ac = createMockAircraftDoc({ logbooks: undefined });
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-01-15', description: 'Engine work' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.logbooks).toBeDefined();
    expect(ac.logbooks.engine).toHaveLength(1);
  });

  it('handles structured inspectionType for transponder', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-07-01', description: 'Check', isInspection: true, inspectionType: 'transponder' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.maintenanceDates.transponder.toISOString()).toContain('2024-07-01');
  });

  it('handles structured inspectionType for 100hour', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-08-01', description: 'Inspection', isInspection: true, inspectionType: '100hour' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.maintenanceDates.hundredHour.toISOString()).toContain('2024-08-01');
  });

  it('handles structured inspectionType for ELT', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-09-01', description: 'Check', isInspection: true, inspectionType: 'elt' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.airworthinessStatus.elt.toISOString()).toContain('2024-09-01');
  });

  it('runs safety analysis and saves result', async () => {
    const ac = createMockAircraftDoc();
    mockAircraftFindById.mockResolvedValue(ac);

    const entries = [
      { date: '2024-01-15', description: 'Oil change' },
    ];

    await updateAircraftFromEntries('ac1', entries);

    expect(ac.safetyAnalysis).toBeDefined();
    expect(ac.safetyAnalysis.score).toBe(85);
  });
});
