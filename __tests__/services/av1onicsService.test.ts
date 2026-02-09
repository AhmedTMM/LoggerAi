/**
 * Tests for the AV1ONICS Maintenance Audit Service.
 *
 * AV1ONICS mnemonic:
 *   A - Annual (91.409a)           12 calendar months
 *   V - VOR (91.171)               30 days (IFR only)
 *   1 - 100-Hour (91.409b)         100 tach hours (for-hire only)
 *   O - Altimeter (91.411)         24 calendar months
 *   N - Transponder (91.413)       24 calendar months
 *   I - ELT (91.207)              12 calendar months
 *   C - Compass                    Advisory only
 *   S - Static System (91.411)     24 calendar months
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runAV1ONICSAudit,
  getAV1ONICSSummary,
  aircraftRequiresMEL,
} from '@/lib/services/av1onicsService';
import type { IAV1ONICSAudit } from '@/lib/services/av1onicsService';
import { createFullMockAircraft } from '@/__tests__/helpers';
import type { IAircraft } from '@/lib/models/Aircraft';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an aircraft mock whose airworthinessStatus fields match exactly what
 *  the service reads (annual, transponder, altimeter, staticSystem, vor, elt,
 *  eltBatteryExpiration, hundredHour, isForHire).
 *
 *  The existing `createMockAircraft` helper in __tests__/helpers.ts uses
 *  slightly different key names, so we normalise here.
 */
function buildAircraft(
  overrides: Record<string, any> = {},
): IAircraft {
  const base = createFullMockAircraft();

  // Replace with properly-keyed airworthiness status
  const sixMonthsAgo = monthsAgo(6);
  const aircraft: any = {
    ...base,
    maintenanceDates: {
      annual: sixMonthsAgo,
      transponder: sixMonthsAgo,
      staticSystem: sixMonthsAgo,
    },
    airworthinessStatus: {
      annual: sixMonthsAgo,
      transponder: sixMonthsAgo,
      altimeter: sixMonthsAgo,
      staticSystem: sixMonthsAgo,
      vor: daysAgo(15),
      elt: sixMonthsAgo,
      hundredHour: sixMonthsAgo,
      isForHire: false,
    },
    currentHours: { hobbs: 3500, tach: 3400 },
    logs: [],
    ...overrides,
  };

  // Deep-merge nested objects when caller provides them
  if (overrides.airworthinessStatus) {
    aircraft.airworthinessStatus = {
      ...aircraft.airworthinessStatus,
      ...overrides.airworthinessStatus,
    };
  }
  if (overrides.maintenanceDates) {
    aircraft.maintenanceDates = {
      ...aircraft.maintenanceDates,
      ...overrides.maintenanceDates,
    };
  }
  if (overrides.currentHours) {
    aircraft.currentHours = {
      ...aircraft.currentHours,
      ...overrides.currentHours,
    };
  }

  return aircraft as IAircraft;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

// ---------------------------------------------------------------------------
// Freeze Date.now so calendar-month arithmetic is deterministic
// ---------------------------------------------------------------------------
const FIXED_NOW = new Date('2025-06-15T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ now: FIXED_NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// A - Annual Inspection (FAR 91.409a) -- 12 calendar months, due_soon <= 30d
// ---------------------------------------------------------------------------
describe('A - Annual Inspection (FAR 91.409a)', () => {
  it('returns current when annual was done 6 months ago', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { annual: monthsAgo(6) },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.annual.status).toBe('current');
    expect(audit.checks.annual.severity).toBe('ok');
    expect(audit.checks.annual.regulatoryReference).toBe('FAR 91.409(a)');
    expect(audit.checks.annual.code).toBe('A');
    expect(audit.checks.annual.daysRemaining).toBeGreaterThan(30);
  });

  it('returns due_soon when annual is within 30 days of expiry', () => {
    // monthsAgo(12) + addCalendarMonths(12) = end of current month ≈ 15 days
    const aircraft = buildAircraft({
      airworthinessStatus: { annual: monthsAgo(12) },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.annual.status).toBe('due_soon');
    expect(audit.checks.annual.severity).toBe('warning');
    expect(audit.checks.annual.daysRemaining).toBeGreaterThanOrEqual(0);
    expect(audit.checks.annual.daysRemaining).toBeLessThanOrEqual(30);
  });

  it('returns overdue when annual was done 13 months ago', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { annual: monthsAgo(13) },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.annual.status).toBe('overdue');
    expect(audit.checks.annual.severity).toBe('critical');
    expect(audit.checks.annual.daysRemaining).toBeLessThan(0);
    expect(audit.checks.annual.message).toContain('OVERDUE');
    expect(audit.checks.annual.message).toContain('NOT AIRWORTHY');
  });

  it('returns overdue with critical message when no annual date exists', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { annual: undefined },
      maintenanceDates: { annual: undefined },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.annual.status).toBe('overdue');
    expect(audit.checks.annual.severity).toBe('critical');
    expect(audit.checks.annual.isRequired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// V - VOR Accuracy Check (FAR 91.171) -- 30 days, due_soon <= 7d, IFR only
// ---------------------------------------------------------------------------
describe('V - VOR Accuracy Check (FAR 91.171)', () => {
  const IFR_CONFIG = { isIFRFlight: true };

  it('returns na when flight is VFR (default config)', () => {
    const aircraft = buildAircraft();
    const audit = runAV1ONICSAudit(aircraft); // default is VFR

    expect(audit.checks.vor.status).toBe('na');
    expect(audit.checks.vor.isRequired).toBe(false);
  });

  it('returns current when VOR checked 15 days ago (IFR)', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { vor: daysAgo(15) },
    });
    const audit = runAV1ONICSAudit(aircraft, IFR_CONFIG);

    expect(audit.checks.vor.status).toBe('current');
    expect(audit.checks.vor.severity).toBe('ok');
    expect(audit.checks.vor.regulatoryReference).toBe('FAR 91.171');
    expect(audit.checks.vor.code).toBe('V');
    expect(audit.checks.vor.daysRemaining).toBeGreaterThan(7);
  });

  it('returns due_soon when VOR checked 28 days ago (IFR)', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { vor: daysAgo(28) },
    });
    const audit = runAV1ONICSAudit(aircraft, IFR_CONFIG);

    // 30 - 28 = 2 days remaining, within 7-day threshold
    expect(audit.checks.vor.status).toBe('due_soon');
    expect(audit.checks.vor.severity).toBe('warning');
    expect(audit.checks.vor.daysRemaining).toBeLessThanOrEqual(7);
    expect(audit.checks.vor.daysRemaining).toBeGreaterThanOrEqual(0);
  });

  it('returns overdue when VOR checked 35 days ago (IFR)', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { vor: daysAgo(35) },
    });
    const audit = runAV1ONICSAudit(aircraft, IFR_CONFIG);

    expect(audit.checks.vor.status).toBe('overdue');
    expect(audit.checks.vor.severity).toBe('critical');
    expect(audit.checks.vor.daysRemaining).toBeLessThan(0);
    expect(audit.checks.vor.message).toContain('OVERDUE');
    expect(audit.checks.vor.message).toContain('ILLEGAL FOR IFR');
  });

  it('returns overdue when no VOR record exists (IFR)', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { vor: undefined },
    });
    const audit = runAV1ONICSAudit(aircraft, IFR_CONFIG);

    expect(audit.checks.vor.status).toBe('overdue');
    expect(audit.checks.vor.severity).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// 1 - 100-Hour Inspection (FAR 91.409b) -- tach-based, for-hire only
// ---------------------------------------------------------------------------
describe('1 - 100-Hour Inspection (FAR 91.409b)', () => {
  const FOR_HIRE_CONFIG = { isForHire: true };

  it('returns na when aircraft is not for hire (default)', () => {
    const aircraft = buildAircraft();
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.hundredHour.status).toBe('na');
    expect(audit.checks.hundredHour.isRequired).toBe(false);
  });

  it('returns current at 50 hours since last 100-hour (for hire)', () => {
    // Service looks for log entry with "100" or "hundred" in description
    // to find lastTachAt100, then compares to currentTach.
    const lastTach = 3000;
    const currentTach = lastTach + 50; // 50 hours since

    const aircraft = buildAircraft({
      airworthinessStatus: { hundredHour: monthsAgo(1), isForHire: true },
      currentHours: { tach: currentTach, hobbs: currentTach + 50 },
      logs: [
        {
          date: monthsAgo(1),
          description: '100-hour inspection completed',
          hobbsTime: lastTach + 50,
          tachTime: lastTach,
        },
      ],
    });

    const audit = runAV1ONICSAudit(aircraft, FOR_HIRE_CONFIG);

    expect(audit.checks.hundredHour.status).toBe('current');
    expect(audit.checks.hundredHour.severity).toBe('ok');
    expect(audit.checks.hundredHour.hoursRemaining).toBe(50);
    expect(audit.checks.hundredHour.code).toBe('1');
    expect(audit.checks.hundredHour.regulatoryReference).toBe('FAR 91.409(b)');
  });

  it('returns due_soon at 90 hours since last 100-hour (for hire)', () => {
    const lastTach = 3000;
    const currentTach = lastTach + 90;

    const aircraft = buildAircraft({
      airworthinessStatus: { hundredHour: monthsAgo(2), isForHire: true },
      currentHours: { tach: currentTach, hobbs: currentTach + 50 },
      logs: [
        {
          date: monthsAgo(2),
          description: '100-hour inspection',
          hobbsTime: lastTach + 50,
          tachTime: lastTach,
        },
      ],
    });

    const audit = runAV1ONICSAudit(aircraft, FOR_HIRE_CONFIG);

    expect(audit.checks.hundredHour.status).toBe('due_soon');
    expect(audit.checks.hundredHour.severity).toBe('warning');
    expect(audit.checks.hundredHour.hoursRemaining).toBe(10);
  });

  it('returns due_soon in overage period at 105 hours (10-hr allowance)', () => {
    // 105 hours past 100 => hoursRemaining = -5, within [-10, 0] overage zone
    const lastTach = 3000;
    const currentTach = lastTach + 105;

    const aircraft = buildAircraft({
      airworthinessStatus: { hundredHour: monthsAgo(3), isForHire: true },
      currentHours: { tach: currentTach, hobbs: currentTach + 50 },
      logs: [
        {
          date: monthsAgo(3),
          description: '100 hour inspection',
          hobbsTime: lastTach + 50,
          tachTime: lastTach,
        },
      ],
    });

    const audit = runAV1ONICSAudit(aircraft, FOR_HIRE_CONFIG);

    // hoursRemaining = 100 - 105 = -5, which is in [0, -10] overage range => due_soon
    expect(audit.checks.hundredHour.status).toBe('due_soon');
    expect(audit.checks.hundredHour.severity).toBe('warning');
    expect(audit.checks.hundredHour.hoursRemaining).toBe(-5);
    expect(audit.checks.hundredHour.message).toContain('overage');
  });

  it('returns overdue when past 10-hour overage allowance (115 hours)', () => {
    const lastTach = 3000;
    const currentTach = lastTach + 115;

    const aircraft = buildAircraft({
      airworthinessStatus: { hundredHour: monthsAgo(3), isForHire: true },
      currentHours: { tach: currentTach, hobbs: currentTach + 50 },
      logs: [
        {
          date: monthsAgo(3),
          description: '100-hour inspection',
          hobbsTime: lastTach + 50,
          tachTime: lastTach,
        },
      ],
    });

    const audit = runAV1ONICSAudit(aircraft, FOR_HIRE_CONFIG);

    // hoursRemaining = 100 - 115 = -15, past -10 limit
    expect(audit.checks.hundredHour.status).toBe('overdue');
    expect(audit.checks.hundredHour.severity).toBe('critical');
    expect(audit.checks.hundredHour.message).toContain('OVERDUE');
    expect(audit.checks.hundredHour.message).toContain('ILLEGAL FOR HIRE');
  });

  it('returns overdue when no 100-hour record exists (for hire)', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { hundredHour: undefined, isForHire: true },
    });

    const audit = runAV1ONICSAudit(aircraft, FOR_HIRE_CONFIG);

    expect(audit.checks.hundredHour.status).toBe('overdue');
    expect(audit.checks.hundredHour.severity).toBe('critical');
  });

  it('detects for-hire from airworthinessStatus.isForHire even without config', () => {
    const lastTach = 3000;
    const currentTach = lastTach + 50;

    const aircraft = buildAircraft({
      airworthinessStatus: { hundredHour: monthsAgo(1), isForHire: true },
      currentHours: { tach: currentTach, hobbs: currentTach + 50 },
      logs: [
        {
          date: monthsAgo(1),
          description: '100-hour inspection',
          hobbsTime: lastTach + 50,
          tachTime: lastTach,
        },
      ],
    });

    // No isForHire in config, but aircraft.airworthinessStatus.isForHire = true
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.hundredHour.status).toBe('current');
    expect(audit.checks.hundredHour.isRequired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// O - Altimeter/Pitot-Static (FAR 91.411) -- 24 cal months, due_soon <= 60d
// ---------------------------------------------------------------------------
describe('O - Altimeter/Pitot-Static System (FAR 91.411)', () => {
  it('returns current when checked 12 months ago', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { altimeter: monthsAgo(12) },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.altimeter.status).toBe('current');
    expect(audit.checks.altimeter.severity).toBe('ok');
    expect(audit.checks.altimeter.regulatoryReference).toBe('FAR 91.411');
    expect(audit.checks.altimeter.code).toBe('O');
  });

  it('returns due_soon when altimeter is within 60 days of expiry', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { altimeter: monthsAgo(24) },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.altimeter.status).toBe('due_soon');
    expect(audit.checks.altimeter.severity).toBe('warning');
    expect(audit.checks.altimeter.daysRemaining).toBeLessThanOrEqual(60);
    expect(audit.checks.altimeter.daysRemaining).toBeGreaterThanOrEqual(0);
  });

  it('returns overdue when checked 25 months ago', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { altimeter: monthsAgo(25) },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.altimeter.status).toBe('overdue');
    expect(audit.checks.altimeter.daysRemaining).toBeLessThan(0);
    expect(audit.checks.altimeter.message).toContain('OVERDUE');
  });

  it('returns critical severity for overdue altimeter when IFR flight', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { altimeter: monthsAgo(25) },
    });
    const audit = runAV1ONICSAudit(aircraft, { isIFRFlight: true });

    expect(audit.checks.altimeter.status).toBe('overdue');
    expect(audit.checks.altimeter.severity).toBe('critical');
    expect(audit.checks.altimeter.isRequired).toBe(true);
    expect(audit.checks.altimeter.message).toContain('ILLEGAL FOR IFR');
  });

  it('returns warning severity for overdue altimeter when VFR flight', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { altimeter: monthsAgo(25) },
    });
    const audit = runAV1ONICSAudit(aircraft, { isIFRFlight: false });

    expect(audit.checks.altimeter.status).toBe('overdue');
    expect(audit.checks.altimeter.severity).toBe('warning');
    expect(audit.checks.altimeter.isRequired).toBe(false);
  });

  it('returns na when no altimeter record and VFR flight', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { altimeter: undefined },
      maintenanceDates: { staticSystem: undefined },
    });
    const audit = runAV1ONICSAudit(aircraft, { isIFRFlight: false });

    expect(audit.checks.altimeter.status).toBe('na');
    expect(audit.checks.altimeter.severity).toBe('warning');
  });

  it('returns overdue when no altimeter record and IFR flight', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { altimeter: undefined },
      maintenanceDates: { staticSystem: undefined },
    });
    const audit = runAV1ONICSAudit(aircraft, { isIFRFlight: true });

    expect(audit.checks.altimeter.status).toBe('overdue');
    expect(audit.checks.altimeter.severity).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// N - Transponder (FAR 91.413) -- 24 cal months, due_soon <= 60d
// ---------------------------------------------------------------------------
describe('N - Transponder Inspection (FAR 91.413)', () => {
  it('returns current when checked 12 months ago', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { transponder: monthsAgo(12) },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.transponder.status).toBe('current');
    expect(audit.checks.transponder.severity).toBe('ok');
    expect(audit.checks.transponder.regulatoryReference).toBe('FAR 91.413');
    expect(audit.checks.transponder.code).toBe('N');
  });

  it('returns due_soon when transponder is within 60 days of expiry', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { transponder: monthsAgo(24) },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.transponder.status).toBe('due_soon');
    expect(audit.checks.transponder.severity).toBe('warning');
    expect(audit.checks.transponder.daysRemaining).toBeLessThanOrEqual(60);
    expect(audit.checks.transponder.daysRemaining).toBeGreaterThanOrEqual(0);
  });

  it('returns overdue when checked 25 months ago', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { transponder: monthsAgo(25) },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.transponder.status).toBe('overdue');
    expect(audit.checks.transponder.severity).toBe('critical');
    expect(audit.checks.transponder.daysRemaining).toBeLessThan(0);
    expect(audit.checks.transponder.message).toContain('OVERDUE');
    expect(audit.checks.transponder.message).toContain('MODE C AIRSPACE');
  });

  it('returns overdue when no transponder record and transponder required', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { transponder: undefined },
      maintenanceDates: { transponder: undefined },
    });
    const audit = runAV1ONICSAudit(aircraft, { requiresTransponder: true });

    expect(audit.checks.transponder.status).toBe('overdue');
    expect(audit.checks.transponder.severity).toBe('critical');
  });

  it('returns na when no transponder record and transponder not required', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { transponder: undefined },
      maintenanceDates: { transponder: undefined },
    });
    const audit = runAV1ONICSAudit(aircraft, { requiresTransponder: false });

    expect(audit.checks.transponder.status).toBe('na');
  });
});

// ---------------------------------------------------------------------------
// I - ELT (FAR 91.207) -- 12 cal months, due_soon <= 30d, battery check
// ---------------------------------------------------------------------------
describe('I - ELT Inspection (FAR 91.207)', () => {
  it('returns current when inspected 6 months ago', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { elt: monthsAgo(6) },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.elt.status).toBe('current');
    expect(audit.checks.elt.severity).toBe('ok');
    expect(audit.checks.elt.regulatoryReference).toBe('FAR 91.207');
    expect(audit.checks.elt.code).toBe('I');
    expect(audit.checks.elt.daysRemaining).toBeGreaterThan(30);
  });

  it('returns due_soon when ELT is within 30 days of expiry', () => {
    // monthsAgo(12) + addCalendarMonths(12) = end of current month ≈ 15 days
    const aircraft = buildAircraft({
      airworthinessStatus: { elt: monthsAgo(12) },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.elt.status).toBe('due_soon');
    expect(audit.checks.elt.severity).toBe('warning');
    expect(audit.checks.elt.daysRemaining).toBeLessThanOrEqual(30);
    expect(audit.checks.elt.daysRemaining).toBeGreaterThanOrEqual(0);
  });

  it('returns overdue when inspected 13 months ago', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { elt: monthsAgo(13) },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.elt.status).toBe('overdue');
    expect(audit.checks.elt.severity).toBe('critical');
    expect(audit.checks.elt.daysRemaining).toBeLessThan(0);
    expect(audit.checks.elt.message).toContain('OVERDUE');
  });

  it('returns overdue when no ELT record exists', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { elt: undefined },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.elt.status).toBe('overdue');
    expect(audit.checks.elt.severity).toBe('critical');
    expect(audit.checks.elt.isRequired).toBe(true);
  });

  it('flags overdue when ELT battery has expired', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: {
        elt: monthsAgo(6), // inspection itself still current
        eltBatteryExpiration: daysAgo(10), // but battery expired 10 days ago
      },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.elt.status).toBe('overdue');
    expect(audit.checks.elt.severity).toBe('critical');
    expect(audit.checks.elt.message).toContain('battery');
  });

  it('flags due_soon when ELT battery expires within 30 days', () => {
    // Battery expires in 15 days (inspection still current)
    const batteryDate = new Date(FIXED_NOW);
    batteryDate.setDate(batteryDate.getDate() + 15);

    const aircraft = buildAircraft({
      airworthinessStatus: {
        elt: monthsAgo(6),
        eltBatteryExpiration: batteryDate,
      },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.elt.status).toBe('due_soon');
    expect(audit.checks.elt.severity).toBe('warning');
    expect(audit.checks.elt.message).toContain('battery');
  });
});

// ---------------------------------------------------------------------------
// C - Compass Swing (advisory, no regulatory requirement)
// ---------------------------------------------------------------------------
describe('C - Compass Swing (advisory)', () => {
  it('always returns na status (advisory only)', () => {
    const aircraft = buildAircraft();
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.compass.status).toBe('na');
    expect(audit.checks.compass.code).toBe('C');
    expect(audit.checks.compass.isRequired).toBe(false);
    expect(audit.checks.compass.severity).toBe('ok');
    expect(audit.checks.compass.regulatoryReference).toContain('Advisory');
  });

  it('returns na regardless of aircraft state', () => {
    // Even with empty airworthiness, compass should be na
    const aircraft = buildAircraft({
      airworthinessStatus: {},
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.compass.status).toBe('na');
    expect(audit.checks.compass.severity).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// S - Static System (FAR 91.411) -- 24 cal months, due_soon <= 60d
// ---------------------------------------------------------------------------
describe('S - Static System Check (FAR 91.411)', () => {
  it('returns current when checked 12 months ago', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { staticSystem: monthsAgo(12) },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.staticSystem.status).toBe('current');
    expect(audit.checks.staticSystem.severity).toBe('ok');
    expect(audit.checks.staticSystem.regulatoryReference).toBe('FAR 91.411');
    expect(audit.checks.staticSystem.code).toBe('S');
  });

  it('returns due_soon when static system is within 60 days of expiry', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { staticSystem: monthsAgo(24) },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.staticSystem.status).toBe('due_soon');
    expect(audit.checks.staticSystem.severity).toBe('warning');
    expect(audit.checks.staticSystem.daysRemaining).toBeLessThanOrEqual(60);
    expect(audit.checks.staticSystem.daysRemaining).toBeGreaterThanOrEqual(0);
  });

  it('returns overdue when checked 25 months ago', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { staticSystem: monthsAgo(25) },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks.staticSystem.status).toBe('overdue');
    expect(audit.checks.staticSystem.daysRemaining).toBeLessThan(0);
    expect(audit.checks.staticSystem.message).toContain('OVERDUE');
  });

  it('returns critical severity for overdue static system when IFR flight', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { staticSystem: monthsAgo(25) },
    });
    const audit = runAV1ONICSAudit(aircraft, { isIFRFlight: true });

    expect(audit.checks.staticSystem.status).toBe('overdue');
    expect(audit.checks.staticSystem.severity).toBe('critical');
    expect(audit.checks.staticSystem.isRequired).toBe(true);
    expect(audit.checks.staticSystem.message).toContain('ILLEGAL FOR IFR');
  });

  it('returns warning severity for overdue static system when VFR flight', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { staticSystem: monthsAgo(25) },
    });
    const audit = runAV1ONICSAudit(aircraft, { isIFRFlight: false });

    expect(audit.checks.staticSystem.status).toBe('overdue');
    expect(audit.checks.staticSystem.severity).toBe('warning');
    expect(audit.checks.staticSystem.isRequired).toBe(false);
  });

  it('returns na when no static system record and VFR flight', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { staticSystem: undefined },
      maintenanceDates: { staticSystem: undefined },
    });
    const audit = runAV1ONICSAudit(aircraft, { isIFRFlight: false });

    expect(audit.checks.staticSystem.status).toBe('na');
  });

  it('returns overdue when no static system record and IFR flight', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { staticSystem: undefined },
      maintenanceDates: { staticSystem: undefined },
    });
    const audit = runAV1ONICSAudit(aircraft, { isIFRFlight: true });

    expect(audit.checks.staticSystem.status).toBe('overdue');
    expect(audit.checks.staticSystem.severity).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// Overall Score
// ---------------------------------------------------------------------------
describe('Overall Score and Status', () => {
  it('returns score near 100 when all checks are current', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: {
        annual: monthsAgo(6),
        transponder: monthsAgo(6),
        altimeter: monthsAgo(6),
        staticSystem: monthsAgo(6),
        vor: daysAgo(5),
        elt: monthsAgo(6),
        hundredHour: monthsAgo(1),
        isForHire: false,
      },
    });

    const audit = runAV1ONICSAudit(aircraft);

    // All checks current. VOR is na (VFR), 100hr is na (not for hire),
    // compass is na (advisory). Remaining checks all ok.
    // Non-required items with severity=warning (altimeter/static na cases)
    // may cause small deductions, but mostly should be near 100.
    expect(audit.overallScore).toBeGreaterThanOrEqual(80);
    expect(audit.overallStatus).toBe('airworthy');
    expect(audit.criticalIssues).toHaveLength(0);
  });

  it('reduces score when some checks are due_soon', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: {
        annual: monthsAgo(12),     // due_soon (warning on required)
        transponder: monthsAgo(24), // due_soon (warning)
        altimeter: monthsAgo(6),
        staticSystem: monthsAgo(6),
        elt: monthsAgo(12),        // due_soon (warning)
        isForHire: false,
      },
    });

    const audit = runAV1ONICSAudit(aircraft);

    // Multiple warnings reduce score
    expect(audit.overallScore).toBeLessThan(100);
    expect(audit.overallStatus).toBe('conditional');
    expect(audit.warnings.length).toBeGreaterThan(0);
  });

  it('significantly reduces score when any required check is overdue', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: {
        annual: monthsAgo(13), // overdue (critical on required)
        transponder: monthsAgo(6),
        altimeter: monthsAgo(6),
        staticSystem: monthsAgo(6),
        elt: monthsAgo(6),
        isForHire: false,
      },
    });

    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.overallScore).toBeLessThanOrEqual(70);
    expect(audit.overallStatus).toBe('grounded');
    expect(audit.criticalIssues.length).toBeGreaterThan(0);
    expect(audit.recommendations).toContain(
      'DO NOT FLY - Aircraft has critical airworthiness issues'
    );
  });

  it('returns low score when multiple checks are overdue', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: {
        annual: monthsAgo(13),       // overdue
        transponder: monthsAgo(25),  // overdue
        altimeter: monthsAgo(25),    // overdue
        staticSystem: monthsAgo(25), // overdue
        elt: monthsAgo(13),          // overdue
        isForHire: false,
      },
    });

    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.overallScore).toBeLessThanOrEqual(40);
    expect(audit.overallStatus).toBe('grounded');
    expect(audit.criticalIssues.length).toBeGreaterThanOrEqual(2);
  });

  it('returns grounded status when a required check has critical severity', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: {
        annual: monthsAgo(13), // overdue, required, critical
        transponder: monthsAgo(6),
        altimeter: monthsAgo(6),
        staticSystem: monthsAgo(6),
        elt: monthsAgo(6),
      },
    });

    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.overallStatus).toBe('grounded');
  });

  it('returns conditional status when a required check has warning severity', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: {
        annual: monthsAgo(12), // due_soon, required, warning
        transponder: monthsAgo(6),
        altimeter: monthsAgo(6),
        staticSystem: monthsAgo(6),
        elt: monthsAgo(6),
      },
    });

    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.overallStatus).toBe('conditional');
  });

  it('returns airworthy when all required checks are ok', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: {
        annual: monthsAgo(2),
        transponder: monthsAgo(2),
        altimeter: monthsAgo(2),
        staticSystem: monthsAgo(2),
        elt: monthsAgo(2),
        isForHire: false,
      },
    });

    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.overallStatus).toBe('airworthy');
  });
});

// ---------------------------------------------------------------------------
// MEL / KOEL Support
// ---------------------------------------------------------------------------
describe('MEL/KOEL Support', () => {
  it('returns compliant when no MEL issues exist', () => {
    const aircraft = buildAircraft();
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.melCheck.status).toBe('compliant');
    expect(audit.melCheck.inoperativeItems).toHaveLength(0);
  });

  it('returns warning when MEL is required but not uploaded', () => {
    const aircraft = buildAircraft({
      melConfig: {
        requiresMEL: true,
        melDocumentId: undefined,
        koelApplicable: false,
        items: [],
      },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.melCheck.status).toBe('warning');
    expect(audit.melCheck.requiresMEL).toBe(true);
    expect(audit.melCheck.melUploaded).toBe(false);
    expect(audit.melCheck.message).toContain('MEL required');
  });

  it('returns non_compliant when required equipment is inoperative', () => {
    const aircraft = buildAircraft({
      melConfig: {
        requiresMEL: true,
        melDocumentId: 'mel-doc-123',
        koelApplicable: false,
        items: [
          { item: 'Landing Light', required: true, status: 'inoperative' } as any,
          { item: 'Cabin Light', required: false, status: 'inoperative' } as any,
        ],
      },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.melCheck.status).toBe('non_compliant');
    expect(audit.melCheck.message).toContain('required item(s) inoperative');
  });

  it('returns warning when non-required equipment is inoperative', () => {
    const aircraft = buildAircraft({
      melConfig: {
        requiresMEL: true,
        melDocumentId: 'mel-doc-123',
        koelApplicable: false,
        items: [
          { item: 'Cup Holder Light', required: false, status: 'inoperative' } as any,
        ],
      },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.melCheck.status).toBe('warning');
    expect(audit.melCheck.message).toContain('inoperative');
    expect(audit.melCheck.message).toContain('verify MEL compliance');
  });

  it('tracks deferred items separately', () => {
    const aircraft = buildAircraft({
      melConfig: {
        requiresMEL: true,
        melDocumentId: 'mel-doc-123',
        koelApplicable: false,
        items: [
          { item: 'Strobe Light', required: false, status: 'deferred' } as any,
        ],
      },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.melCheck.deferredItems).toHaveLength(1);
    expect(audit.melCheck.deferredItems[0].item).toBe('Strobe Light');
  });

  it('reduces overall score when MEL is non_compliant', () => {
    const allCurrentAircraft = buildAircraft({
      airworthinessStatus: {
        annual: monthsAgo(2),
        transponder: monthsAgo(2),
        altimeter: monthsAgo(2),
        staticSystem: monthsAgo(2),
        elt: monthsAgo(2),
        isForHire: false,
      },
    });
    const baseAudit = runAV1ONICSAudit(allCurrentAircraft);

    const aircraftWithMELIssue = buildAircraft({
      airworthinessStatus: {
        annual: monthsAgo(2),
        transponder: monthsAgo(2),
        altimeter: monthsAgo(2),
        staticSystem: monthsAgo(2),
        elt: monthsAgo(2),
        isForHire: false,
      },
      melConfig: {
        requiresMEL: true,
        melDocumentId: 'mel-doc',
        koelApplicable: false,
        items: [
          { item: 'Nav Light', required: true, status: 'inoperative' } as any,
        ],
      },
    });
    const melAudit = runAV1ONICSAudit(aircraftWithMELIssue);

    // Non-compliant MEL deducts 25 points
    expect(melAudit.overallScore).toBeLessThan(baseAudit.overallScore);
    expect(melAudit.overallStatus).toBe('grounded');
    expect(melAudit.criticalIssues.some(i => i.includes('MEL'))).toBe(true);
  });

  it('flags KOEL tracking fields', () => {
    const aircraft = buildAircraft({
      melConfig: {
        requiresMEL: false,
        koelApplicable: true,
        koelDocumentId: 'koel-doc-456',
        items: [],
      },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.melCheck.koelApplicable).toBe(true);
    expect(audit.melCheck.koelUploaded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Audit metadata and structure
// ---------------------------------------------------------------------------
describe('Audit metadata and structure', () => {
  it('returns aircraftId and tailNumber from the aircraft', () => {
    const aircraft = buildAircraft();
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.aircraftId).toBe(aircraft._id.toString());
    expect(audit.tailNumber).toBe('N12345');
  });

  it('sets auditDate to current time', () => {
    const aircraft = buildAircraft();
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.auditDate.getTime()).toBe(FIXED_NOW.getTime());
  });

  it('contains all 8 AV1ONICS checks', () => {
    const aircraft = buildAircraft();
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.checks).toHaveProperty('annual');
    expect(audit.checks).toHaveProperty('vor');
    expect(audit.checks).toHaveProperty('hundredHour');
    expect(audit.checks).toHaveProperty('altimeter');
    expect(audit.checks).toHaveProperty('transponder');
    expect(audit.checks).toHaveProperty('elt');
    expect(audit.checks).toHaveProperty('compass');
    expect(audit.checks).toHaveProperty('staticSystem');
  });

  it('includes recommendations for grounded aircraft', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { annual: monthsAgo(13) },
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.recommendations).toContain(
      'DO NOT FLY - Aircraft has critical airworthiness issues'
    );
    expect(audit.recommendations).toContain(
      'Contact A&P mechanic immediately to address overdue inspections'
    );
  });

  it('includes IFR recommendation for conditional IFR flights', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { transponder: monthsAgo(22) }, // due_soon
    });
    const audit = runAV1ONICSAudit(aircraft, { isIFRFlight: true });

    if (audit.overallStatus === 'conditional') {
      expect(audit.recommendations).toContain(
        'Verify all IFR-required inspections before instrument flight'
      );
    }
  });

  it('recommends MEL upload for complex aircraft without one', () => {
    const aircraft = buildAircraft({
      model: 'King Air 350',
      manufacturer: 'Beechcraft',
    });
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.recommendations).toContain(
      'This aircraft type typically requires an MEL - consider uploading'
    );
  });
});

// ---------------------------------------------------------------------------
// getAV1ONICSSummary
// ---------------------------------------------------------------------------
describe('getAV1ONICSSummary', () => {
  it('returns a string with all 8 AV1ONICS codes', () => {
    const aircraft = buildAircraft();
    const audit = runAV1ONICSAudit(aircraft);
    const summary = getAV1ONICSSummary(audit);

    // Should contain each code letter somewhere
    expect(summary).toContain('A');
    expect(summary).toContain('V');
    expect(summary).toContain('1');
    expect(summary).toContain('O');
    expect(summary).toContain('N');
    expect(summary).toContain('I');
    expect(summary).toContain('C');
    expect(summary).toContain('S');
  });

  it('wraps na codes in brackets', () => {
    const aircraft = buildAircraft();
    const audit = runAV1ONICSAudit(aircraft); // VFR default, so VOR=na, 100hr=na, compass=na

    const summary = getAV1ONICSSummary(audit);

    // VOR, 100-hr, compass should be [V], [1], [C]
    expect(summary).toContain('[V]');
    expect(summary).toContain('[1]');
    expect(summary).toContain('[C]');
  });
});

// ---------------------------------------------------------------------------
// aircraftRequiresMEL
// ---------------------------------------------------------------------------
describe('aircraftRequiresMEL', () => {
  it('returns true for complex aircraft models', () => {
    expect(aircraftRequiresMEL('King Air 350', 'Beechcraft')).toBe(true);
    expect(aircraftRequiresMEL('Baron G58', 'Beechcraft')).toBe(true);
    expect(aircraftRequiresMEL('Bonanza A36', 'Beechcraft')).toBe(true);
    expect(aircraftRequiresMEL('SF50 Vision Jet', 'Cirrus')).toBe(true);
    expect(aircraftRequiresMEL('Citation CJ3', 'Cessna')).toBe(true);
    expect(aircraftRequiresMEL('PA-34 Seneca', 'Piper')).toBe(true);
    expect(aircraftRequiresMEL('Malibu M350', 'Piper')).toBe(true);
    expect(aircraftRequiresMEL('TBM 940', 'Daher')).toBe(true);
    expect(aircraftRequiresMEL('PC-12', 'Pilatus')).toBe(true);
  });

  it('returns false for simple single-engine aircraft', () => {
    expect(aircraftRequiresMEL('172S', 'Cessna')).toBe(false);
    expect(aircraftRequiresMEL('PA-28-181', 'Piper')).toBe(false);
    expect(aircraftRequiresMEL('SR22', 'Cirrus')).toBe(false);
    expect(aircraftRequiresMEL('DA40', 'Diamond')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Config merging / defaults
// ---------------------------------------------------------------------------
describe('Config merging and defaults', () => {
  it('uses default config when no config provided', () => {
    const aircraft = buildAircraft();
    const audit = runAV1ONICSAudit(aircraft);

    // Default: VFR, not for hire, transponder required
    expect(audit.checks.vor.status).toBe('na'); // VFR
    expect(audit.checks.hundredHour.status).toBe('na'); // not for hire
  });

  it('merges partial config with defaults', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: { vor: daysAgo(5) },
    });
    // Only override isIFRFlight; isForHire and requiresTransponder use defaults
    const audit = runAV1ONICSAudit(aircraft, { isIFRFlight: true });

    expect(audit.checks.vor.status).toBe('current'); // IFR: VOR checked
    expect(audit.checks.hundredHour.status).toBe('na'); // still not for hire
  });

  it('falls back to maintenanceDates when airworthinessStatus fields are missing', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: {
        annual: undefined,
        transponder: undefined,
        staticSystem: undefined,
      },
      maintenanceDates: {
        annual: monthsAgo(3),
        transponder: monthsAgo(3),
        staticSystem: monthsAgo(3),
      },
    });
    const audit = runAV1ONICSAudit(aircraft);

    // Should fall back to maintenanceDates values
    expect(audit.checks.annual.status).toBe('current');
    expect(audit.checks.transponder.status).toBe('current');
    expect(audit.checks.staticSystem.status).toBe('current');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('Edge cases', () => {
  it('handles aircraft with no airworthinessStatus at all', () => {
    const aircraft = buildAircraft({
      airworthinessStatus: undefined,
      maintenanceDates: {
        annual: monthsAgo(3),
        transponder: monthsAgo(3),
        staticSystem: monthsAgo(3),
      },
    });

    // Should not throw; falls back to maintenanceDates or reports overdue
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit).toBeDefined();
    expect(audit.checks.annual.status).toBe('current');
  });

  it('score never goes below 0', () => {
    // Everything overdue, MEL non-compliant
    const aircraft = buildAircraft({
      airworthinessStatus: {
        annual: monthsAgo(14),
        transponder: monthsAgo(26),
        altimeter: monthsAgo(26),
        staticSystem: monthsAgo(26),
        elt: monthsAgo(14),
        vor: daysAgo(40),
        isForHire: true,
      },
      melConfig: {
        requiresMEL: true,
        melDocumentId: 'doc',
        koelApplicable: false,
        items: [
          { item: 'Engine', required: true, status: 'inoperative' } as any,
        ],
      },
    });

    const audit = runAV1ONICSAudit(aircraft, {
      isIFRFlight: true,
      isForHire: true,
    });

    expect(audit.overallScore).toBeGreaterThanOrEqual(0);
  });

  it('score never goes above 100', () => {
    const aircraft = buildAircraft();
    const audit = runAV1ONICSAudit(aircraft);

    expect(audit.overallScore).toBeLessThanOrEqual(100);
  });
});
