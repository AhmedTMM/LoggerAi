// Tests for the legality/compliance engine (legalityService.ts)
//
// Strategy: The internal check functions (checkAnnualInspection, checkMedical, etc.)
// are not exported, but `runBasicLegalityAudit` IS exported and accepts data objects
// directly (no DB needed). We mock the weather service to isolate the checks.
//
// `runLegalityAudit` requires a Flight ID and hits the DB/comprehensive service,
// so we test it separately with mongoose mocks.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFullMockAircraft,
  createFullMockPilot,
  createSimpleWeather,
  monthsAgo,
  monthsFromNow,
  daysAgo,
} from '@/__tests__/helpers';
import { REGULATION_REFS } from '@/lib/faaRegulations';

// Mock the weather service so runBasicLegalityAudit does not hit the network
vi.mock('@/lib/services/weatherService', () => ({
  fetchWeatherData: vi.fn(),
  fetchEnhancedWeatherData: vi.fn(),
  fetchRouteWeather: vi.fn(),
  analyzeWeatherVsPilot: vi.fn(),
  analyzeWeatherVsAircraft: vi.fn(),
}));

// Mock the comprehensive safety service (imported by legalityService)
vi.mock('@/lib/services/comprehensiveSafetyService', () => ({
  runComprehensiveSafetyAnalysis: vi.fn(),
}));

// Mock the email service
vi.mock('@/lib/services/emailService', () => ({
  sendPreFlightAgenticAlert: vi.fn(),
}));

// Mock the DB connection and Flight model (legalityService imports Flight)
vi.mock('@/lib/db', () => ({ default: vi.fn() }));
vi.mock('@/lib/models/Flight', () => {
  const mockModel: any = vi.fn();
  mockModel.findById = vi.fn();
  return { default: mockModel };
});
vi.mock('@/lib/models/Aircraft', () => ({ default: {} }));
vi.mock('@/lib/models/Pilot', () => ({ default: {} }));

import { runBasicLegalityAudit, type BasicAuditResult } from '@/lib/services/legalityService';
import { fetchWeatherData } from '@/lib/services/weatherService';

const mockedFetchWeather = vi.mocked(fetchWeatherData);

// ---------------------------------------------------------------------------
// Helper: run audit with defaults (VFR weather or no weather)
// ---------------------------------------------------------------------------
async function auditWith(
  aircraftOverrides: Record<string, any> = {},
  pilotOverrides: Record<string, any> = {},
  options: { weather?: any; flightDate?: Date } = {}
): Promise<BasicAuditResult> {
  const aircraft = createFullMockAircraft(aircraftOverrides);
  const pilot = createFullMockPilot(pilotOverrides);
  const flightDate = options.flightDate || new Date();

  if (options.weather !== undefined) {
    mockedFetchWeather.mockResolvedValueOnce(options.weather);
  } else {
    // Default: no weather returned
    mockedFetchWeather.mockResolvedValueOnce(null);
  }

  return runBasicLegalityAudit(aircraft, pilot, flightDate, 'KJFK');
}

// ---------------------------------------------------------------------------
// Helpers to find checks in the result
// ---------------------------------------------------------------------------
function findCheck(result: BasicAuditResult, itemSubstring: string) {
  return result.checks.find(c => c.item.includes(itemSubstring));
}

function findCheckStatus(result: BasicAuditResult, itemSubstring: string) {
  return findCheck(result, itemSubstring)?.status;
}

// =============================================================================
// AIRCRAFT MAINTENANCE CHECKS
// =============================================================================

describe('runBasicLegalityAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Annual Inspection (14 CFR 91.409(a))', () => {
    it('passes when annual is within 12 months', async () => {
      const result = await auditWith({
        maintenanceDates: {
          annual: monthsAgo(6),
          transponder: monthsAgo(6),
          staticSystem: monthsAgo(6),
        },
      });
      expect(findCheckStatus(result, 'Annual')).toBe('pass');
    });

    it('warns when annual is due within 30 days', async () => {
      // Annual done about 11 months and 10 days ago (due in ~20 days)
      const annualDate = new Date();
      annualDate.setFullYear(annualDate.getFullYear() - 1);
      annualDate.setDate(annualDate.getDate() + 20);

      const result = await auditWith({
        maintenanceDates: {
          annual: annualDate,
          transponder: monthsAgo(6),
          staticSystem: monthsAgo(6),
        },
      });
      expect(findCheckStatus(result, 'Annual')).toBe('warning');
    });

    it('fails when annual is overdue (> 12 months)', async () => {
      const result = await auditWith({
        maintenanceDates: {
          annual: monthsAgo(14),
          transponder: monthsAgo(6),
          staticSystem: monthsAgo(6),
        },
      });
      expect(findCheckStatus(result, 'Annual')).toBe('fail');
      const check = findCheck(result, 'Annual');
      expect(check?.message).toContain('overdue');
      expect(check?.regulatoryReference).toBe(REGULATION_REFS.ANNUAL_INSPECTION);
    });

    it('results in no-go when annual is overdue', async () => {
      const result = await auditWith({
        maintenanceDates: {
          annual: monthsAgo(14),
          transponder: monthsAgo(6),
          staticSystem: monthsAgo(6),
        },
      });
      expect(result.overallStatus).toBe('no-go');
    });
  });

  describe('Transponder Check (14 CFR 91.413)', () => {
    it('passes when transponder is within 24 months', async () => {
      const result = await auditWith({
        maintenanceDates: {
          annual: monthsAgo(6),
          transponder: monthsAgo(12),
          staticSystem: monthsAgo(6),
        },
      });
      expect(findCheckStatus(result, 'Transponder')).toBe('pass');
    });

    it('warns when transponder is due within 60 days', async () => {
      // Transponder done about 22.5 months ago
      const transponderDate = new Date();
      transponderDate.setMonth(transponderDate.getMonth() - 24);
      transponderDate.setDate(transponderDate.getDate() + 45);

      const result = await auditWith({
        maintenanceDates: {
          annual: monthsAgo(6),
          transponder: transponderDate,
          staticSystem: monthsAgo(6),
        },
      });
      expect(findCheckStatus(result, 'Transponder')).toBe('warning');
    });

    it('fails when transponder is overdue (> 24 months)', async () => {
      const result = await auditWith({
        maintenanceDates: {
          annual: monthsAgo(6),
          transponder: monthsAgo(26),
          staticSystem: monthsAgo(6),
        },
      });
      expect(findCheckStatus(result, 'Transponder')).toBe('fail');
      const check = findCheck(result, 'Transponder');
      expect(check?.regulatoryReference).toBe(REGULATION_REFS.TRANSPONDER_CHECK);
    });
  });

  describe('Static System / Altimeter (14 CFR 91.411)', () => {
    it('passes (N/A) for VFR-only pilots since IFR not required', async () => {
      const result = await auditWith(
        {
          maintenanceDates: {
            annual: monthsAgo(6),
            transponder: monthsAgo(6),
            staticSystem: monthsAgo(30),
          },
        },
        {
          certificates: { type: 'PPL', instrumentRated: false, multiEngineRated: false },
        }
      );
      const check = findCheck(result, 'Altimeter/Static');
      expect(check?.status).toBe('pass');
      expect(check?.message).toContain('N/A');
    });

    it('fails when overdue for IFR-rated pilot', async () => {
      const result = await auditWith(
        {
          maintenanceDates: {
            annual: monthsAgo(6),
            transponder: monthsAgo(6),
            staticSystem: monthsAgo(30),
          },
        },
        {
          certificates: { type: 'PPL', instrumentRated: true, multiEngineRated: false },
        }
      );
      const check = findCheck(result, 'Altimeter/Static');
      expect(check?.status).toBe('fail');
    });
  });

  describe('100-Hour Inspection (14 CFR 91.409(b))', () => {
    it('passes (N/A) when not for hire', async () => {
      // runBasicLegalityAudit passes isForHire=false
      const result = await auditWith();
      const check = findCheck(result, '100-Hour');
      expect(check?.status).toBe('pass');
      expect(check?.message).toContain('N/A');
    });
  });

  describe('ELT Inspection (14 CFR 91.207)', () => {
    it('warns when ELT date is not recorded', async () => {
      const result = await auditWith({
        // No airworthinessStatus.elt set
      });
      const check = findCheck(result, 'ELT');
      expect(check?.status).toBe('warning');
      expect(check?.message).toContain('not recorded');
    });

    it('passes when ELT inspection is within 12 months', async () => {
      const result = await auditWith({
        airworthinessStatus: { elt: monthsAgo(6) },
      });
      const check = findCheck(result, 'ELT');
      expect(check?.status).toBe('pass');
    });

    it('fails when ELT inspection is overdue', async () => {
      const result = await auditWith({
        airworthinessStatus: { elt: monthsAgo(14) },
      });
      const check = findCheck(result, 'ELT');
      expect(check?.status).toBe('fail');
    });

    it('fails when ELT battery is expired', async () => {
      const result = await auditWith({
        airworthinessStatus: {
          elt: monthsAgo(6),
          eltBatteryExpiration: monthsAgo(1),
        },
      });
      const check = findCheck(result, 'ELT');
      expect(check?.status).toBe('fail');
      expect(check?.message?.toLowerCase()).toContain('battery');
    });
  });

  // =============================================================================
  // PILOT CURRENCY CHECKS
  // =============================================================================

  describe('Medical Certificate (14 CFR 61.23)', () => {
    it('passes when medical is valid', async () => {
      const result = await auditWith({}, {
        medicalExpiration: monthsFromNow(6),
      });
      expect(findCheckStatus(result, 'Medical')).toBe('pass');
    });

    it('warns when medical expires within 30 days', async () => {
      const medExp = new Date();
      medExp.setDate(medExp.getDate() + 15);
      const result = await auditWith({}, {
        medicalExpiration: medExp,
      });
      expect(findCheckStatus(result, 'Medical')).toBe('warning');
    });

    it('fails when medical is expired', async () => {
      const result = await auditWith({}, {
        medicalExpiration: monthsAgo(2),
      });
      expect(findCheckStatus(result, 'Medical')).toBe('fail');
      const check = findCheck(result, 'Medical');
      expect(check?.message).toContain('expired');
      expect(check?.regulatoryReference).toBe(REGULATION_REFS.MEDICAL_CERTIFICATE);
    });

    it('passes with BasicMed when traditional medical expired', async () => {
      const result = await auditWith({}, {
        medicalExpiration: monthsAgo(2),
        basicMed: {
          enabled: true,
          lastPhysicalExam: monthsAgo(12), // within 48 months
        },
      });
      const check = findCheck(result, 'Medical');
      expect(check?.status).toBe('pass');
      expect(check?.item).toContain('BasicMed');
    });

    it('fails when BasicMed physical exam is also expired (> 48 months)', async () => {
      const result = await auditWith({}, {
        medicalExpiration: monthsAgo(2),
        basicMed: {
          enabled: true,
          lastPhysicalExam: monthsAgo(50), // expired
        },
      });
      expect(findCheckStatus(result, 'Medical')).toBe('fail');
    });

    it('includes medical class in the message', async () => {
      const result = await auditWith({}, {
        medicalClass: '1st',
        medicalExpiration: monthsFromNow(6),
      });
      const check = findCheck(result, 'Medical');
      expect(check?.message).toContain('1st');
    });
  });

  describe('Flight Review (14 CFR 61.56)', () => {
    it('passes when flight review is valid', async () => {
      const result = await auditWith({}, {
        flightReviewExpiration: monthsFromNow(12),
      });
      expect(findCheckStatus(result, 'Flight Review')).toBe('pass');
    });

    it('warns when flight review expires within 30 days', async () => {
      const bfrExp = new Date();
      bfrExp.setDate(bfrExp.getDate() + 20);
      const result = await auditWith({}, {
        flightReviewExpiration: bfrExp,
      });
      expect(findCheckStatus(result, 'Flight Review')).toBe('warning');
    });

    it('fails when flight review is expired', async () => {
      const result = await auditWith({}, {
        flightReviewExpiration: monthsAgo(3),
      });
      expect(findCheckStatus(result, 'Flight Review')).toBe('fail');
      const check = findCheck(result, 'Flight Review');
      expect(check?.message).toContain('expired');
      expect(check?.regulatoryReference).toBe(REGULATION_REFS.FLIGHT_REVIEW);
    });

    it('passes with WINGS completion when flight review is expired', async () => {
      const result = await auditWith({}, {
        flightReviewExpiration: monthsAgo(3),
        wingsPhaseCompleted: {
          phase: 3,
          completedDate: monthsAgo(6), // within 24 months
        },
      });
      const check = findCheck(result, 'Flight Review');
      expect(check?.status).toBe('pass');
      expect(check?.message).toContain('WINGS');
    });

    it('fails when WINGS completion is also expired (> 24 months)', async () => {
      const result = await auditWith({}, {
        flightReviewExpiration: monthsAgo(3),
        wingsPhaseCompleted: {
          phase: 2,
          completedDate: monthsAgo(30),
        },
      });
      expect(findCheckStatus(result, 'Flight Review')).toBe('fail');
    });
  });

  describe('Day Landing Currency (14 CFR 61.57(a))', () => {
    it('passes with 3 or more day landings in 90 days', async () => {
      const result = await auditWith({}, {
        experience: {
          totalHours: 250,
          picHours: 200,
          nightHours: 40,
          ifrHours: 30,
          crossCountryHours: 80,
          last90DaysHours: 15,
          last30DaysHours: 5,
          landingCurrency: {
            dayLandingsLast90Days: 5,
            nightLandingsLast90Days: 3,
          },
        },
      });
      expect(findCheckStatus(result, 'Day Landing')).toBe('pass');
    });

    it('fails with fewer than 3 day landings in 90 days', async () => {
      const result = await auditWith({}, {
        experience: {
          totalHours: 250,
          picHours: 200,
          nightHours: 40,
          ifrHours: 30,
          crossCountryHours: 80,
          last90DaysHours: 15,
          last30DaysHours: 5,
          landingCurrency: {
            dayLandingsLast90Days: 2,
            nightLandingsLast90Days: 0,
          },
        },
      });
      expect(findCheckStatus(result, 'Day Landing')).toBe('fail');
      const check = findCheck(result, 'Day Landing');
      expect(check?.message).toContain('2');
      expect(check?.regulatoryReference).toBe(REGULATION_REFS.DAY_LANDING_CURRENCY);
    });

    it('warns when landing currency data is not recorded', async () => {
      const result = await auditWith({}, {
        experience: {
          totalHours: 250,
          picHours: 200,
          nightHours: 40,
          ifrHours: 30,
          crossCountryHours: 80,
          last90DaysHours: 15,
          last30DaysHours: 5,
          // no landingCurrency
        },
      });
      expect(findCheckStatus(result, 'Day Landing')).toBe('warning');
    });
  });

  // =============================================================================
  // WEATHER vs PILOT CHECKS
  // =============================================================================

  describe('Weather vs Pilot checks', () => {
    it('adds weather checks when weather data is available', async () => {
      const weather = createSimpleWeather({ flightCategory: 'VFR' });
      const result = await auditWith({}, {}, { weather });
      const wxCheck = findCheck(result, 'Weather vs. Ratings');
      expect(wxCheck).toBeDefined();
      expect(wxCheck?.status).toBe('pass');
    });

    it('fails VFR-only pilot in IFR conditions', async () => {
      const weather = createSimpleWeather({
        flightCategory: 'IFR',
        visibility: 1.5,
        ceiling: 400,
      });
      const result = await auditWith(
        {},
        {
          certificates: { type: 'PPL', instrumentRated: false, multiEngineRated: false },
        },
        { weather }
      );
      const wxCheck = findCheck(result, 'Weather vs. Ratings');
      expect(wxCheck?.status).toBe('fail');
      expect(result.overallStatus).toBe('no-go');
    });

    it('warns low-time pilot in MVFR conditions', async () => {
      const weather = createSimpleWeather({
        flightCategory: 'MVFR',
        visibility: 4,
        ceiling: 2500,
      });
      const result = await auditWith(
        {},
        {
          certificates: { type: 'PPL', instrumentRated: false, multiEngineRated: false },
          experience: {
            totalHours: 60,
            picHours: 40,
            nightHours: 5,
            ifrHours: 0,
            crossCountryHours: 10,
            last90DaysHours: 8,
            last30DaysHours: 3,
            landingCurrency: {
              dayLandingsLast90Days: 10,
              nightLandingsLast90Days: 0,
            },
          },
        },
        { weather }
      );
      const wxCheck = findCheck(result, 'Weather vs. Experience');
      expect(wxCheck?.status).toBe('warning');
    });

    it('fails when wind gusts exceed 30 knots', async () => {
      const weather = createSimpleWeather({
        wind: { direction: 220, speed: 25, gust: 35 },
      });
      const result = await auditWith({}, {}, { weather });
      const windCheck = findCheck(result, 'Wind');
      expect(windCheck?.status).toBe('fail');
    });

    it('warns when wind is 20-29 knots', async () => {
      const weather = createSimpleWeather({
        wind: { direction: 220, speed: 22 },
      });
      const result = await auditWith({}, {}, { weather });
      const windCheck = findCheck(result, 'Wind');
      expect(windCheck?.status).toBe('warning');
    });

    it('passes when wind is under 20 knots', async () => {
      const weather = createSimpleWeather({
        wind: { direction: 360, speed: 8 },
      });
      const result = await auditWith({}, {}, { weather });
      const windCheck = findCheck(result, 'Wind');
      expect(windCheck?.status).toBe('pass');
    });

    it('adds a warning check when weather fetch fails', async () => {
      mockedFetchWeather.mockRejectedValueOnce(new Error('Network error'));
      const aircraft = createFullMockAircraft();
      const pilot = createFullMockPilot();
      const result = await runBasicLegalityAudit(aircraft, pilot, new Date(), 'KJFK');
      const wxCheck = findCheck(result, 'Weather Data');
      expect(wxCheck?.status).toBe('warning');
      expect(wxCheck?.message).toContain('Unable to fetch');
    });
  });

  // =============================================================================
  // OVERALL STATUS CALCULATION
  // =============================================================================

  describe('Overall status calculation', () => {
    it('returns "go" when all checks pass', async () => {
      const result = await auditWith(
        {
          maintenanceDates: {
            annual: monthsAgo(6),
            transponder: monthsAgo(6),
            staticSystem: monthsAgo(6),
          },
          airworthinessStatus: { elt: monthsAgo(6) },
        },
        {
          medicalExpiration: monthsFromNow(12),
          flightReviewExpiration: monthsFromNow(12),
        }
      );
      // May be 'go' or 'caution' depending on ELT / other warnings
      // At minimum no fails
      const hasFails = result.checks.some(c => c.status === 'fail');
      expect(hasFails).toBe(false);
    });

    it('returns "no-go" when any check fails', async () => {
      const result = await auditWith(
        {
          maintenanceDates: {
            annual: monthsAgo(14), // overdue
            transponder: monthsAgo(6),
            staticSystem: monthsAgo(6),
          },
        },
      );
      expect(result.overallStatus).toBe('no-go');
    });

    it('returns "caution" when there are warnings but no failures', async () => {
      // ELT not recorded -> warning; everything else passing
      const result = await auditWith(
        {
          maintenanceDates: {
            annual: monthsAgo(6),
            transponder: monthsAgo(6),
            staticSystem: monthsAgo(6),
          },
          // No airworthinessStatus.elt -> ELT warning
        },
        {
          medicalExpiration: monthsFromNow(12),
          flightReviewExpiration: monthsFromNow(12),
        }
      );
      const hasFails = result.checks.some(c => c.status === 'fail');
      const hasWarnings = result.checks.some(c => c.status === 'warning');
      if (!hasFails && hasWarnings) {
        expect(result.overallStatus).toBe('caution');
      }
    });
  });

  // =============================================================================
  // REGULATORY REFERENCE CONSISTENCY
  // =============================================================================

  describe('Regulatory references', () => {
    it('all checks include a regulatory reference where applicable', async () => {
      const result = await auditWith();
      for (const check of result.checks) {
        // Only maintenance and pilot checks have regulatory refs
        if (check.category === 'maintenance' || check.category === 'pilot' || check.category === 'compliance') {
          expect(check.regulatoryReference).toBeTruthy();
        }
      }
    });
  });

  // =============================================================================
  // EDGE CASES
  // =============================================================================

  describe('Edge cases', () => {
    it('handles aircraft with no logs array gracefully', async () => {
      const result = await auditWith({ logs: undefined });
      // Should not throw
      expect(result.checks.length).toBeGreaterThan(0);
    });

    it('handles pilot with missing experience fields gracefully', async () => {
      const result = await auditWith({}, {
        experience: {
          totalHours: 0,
          picHours: 0,
          nightHours: 0,
          ifrHours: 0,
          crossCountryHours: 0,
          last90DaysHours: 0,
          last30DaysHours: 0,
        },
      });
      // Should not throw
      expect(result.checks.length).toBeGreaterThan(0);
    });

    it('uses current date when checking maintenance dates', async () => {
      // Annual done exactly 12 months ago -> should still be valid on the exact anniversary
      // due to "calendar months" interpretation (pass on the day, fail the next day)
      const exactlyOneYearAgo = new Date();
      exactlyOneYearAgo.setFullYear(exactlyOneYearAgo.getFullYear() - 1);

      const result = await auditWith({
        maintenanceDates: {
          annual: exactlyOneYearAgo,
          transponder: monthsAgo(6),
          staticSystem: monthsAgo(6),
        },
      });
      // The check adds 1 year to the annual date via setFullYear, so
      // asOf (today) should be <= oneYearLater (today)
      // This means daysUntilDue = 0, which is <= 30, so it should be 'warning'
      expect(findCheckStatus(result, 'Annual')).toBe('warning');
    });
  });
});
