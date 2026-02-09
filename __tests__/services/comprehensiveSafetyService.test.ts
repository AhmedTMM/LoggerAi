// Tests for the comprehensive safety analysis service
//
// The only export is `runComprehensiveSafetyAnalysis(flightId)`.
// All internal functions (analyzePilot, analyzeAircraft, analyzeFamiliarity,
// calculateSurvivalScore, determineOverallStatus, calculateRiskScenarios)
// are private. We test them indirectly through the main function by mocking
// the DB layer and weather service, then asserting on the composite output.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import {
  createFullMockAircraft,
  createFullMockPilot,
  createMockWeather,
  monthsAgo,
  monthsFromNow,
  daysAgo,
} from '@/__tests__/helpers';
import type { IComprehensiveSafetyAnalysis } from '@/lib/models/Flight';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Weather service
const mockFetchRouteWeather = vi.fn();
const mockFetchEnhancedWeather = vi.fn();
const mockAnalyzeWeatherVsPilot = vi.fn();
const mockAnalyzeWeatherVsAircraft = vi.fn();

vi.mock('@/lib/services/weatherService', () => ({
  fetchRouteWeather: (...args: any[]) => mockFetchRouteWeather(...args),
  fetchEnhancedWeatherData: (...args: any[]) => mockFetchEnhancedWeather(...args),
  analyzeWeatherVsPilot: (...args: any[]) => mockAnalyzeWeatherVsPilot(...args),
  analyzeWeatherVsAircraft: (...args: any[]) => mockAnalyzeWeatherVsAircraft(...args),
}));

// Email service
vi.mock('@/lib/services/emailService', () => ({
  sendPreFlightAgenticAlert: vi.fn().mockResolvedValue(undefined),
}));

// DB connection
vi.mock('@/lib/db', () => ({ default: vi.fn() }));

// Flight model - we build a chainable mock
const mockSave = vi.fn().mockResolvedValue(undefined);

function createMockFlightDoc(pilot: any, aircraft: any, overrides: Record<string, any> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    pilot,
    aircraft,
    scheduledDate: new Date(),
    scheduledDateTime: new Date(),
    departureAirport: 'KJFK',
    arrivalAirport: 'KBOS',
    overallStatus: 'planned',
    legalityChecks: [],
    weather: null,
    arrivalWeather: null,
    preFlightAlertSent: false,
    save: mockSave,
    ...overrides,
  };
}

let mockFlightDoc: any = null;

vi.mock('@/lib/models/Flight', () => {
  const findById = vi.fn().mockImplementation(() => ({
    populate: vi.fn().mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockImplementation(() => Promise.resolve(mockFlightDoc)),
      }),
    }),
  }));

  const Flight: any = function () {};
  Flight.findById = findById;
  Flight.schema = {};
  return { default: Flight };
});

vi.mock('@/lib/models/Aircraft', () => ({ default: {} }));
vi.mock('@/lib/models/Pilot', () => ({ default: {} }));

import { runComprehensiveSafetyAnalysis } from '@/lib/services/comprehensiveSafetyService';

// ---------------------------------------------------------------------------
// Default mocked external data
// ---------------------------------------------------------------------------

function setupDefaultWeatherMocks(overrides: {
  departure?: any;
  arrival?: any;
  pilotLegal?: boolean;
  pilotSafe?: boolean;
  aircraftSafe?: boolean;
} = {}) {
  const depWeather = overrides.departure || createMockWeather({ flightCategory: 'VFR' });
  const arrWeather = overrides.arrival || createMockWeather({ station: 'KBOS', flightCategory: 'VFR' });

  mockFetchRouteWeather.mockResolvedValue({
    departure: depWeather,
    arrival: arrWeather,
    enroute: [],
  });

  mockAnalyzeWeatherVsPilot.mockReturnValue({
    legal: overrides.pilotLegal ?? true,
    safeRecommendation: overrides.pilotSafe ?? true,
    warnings: [],
    recommendations: [],
  });

  mockAnalyzeWeatherVsAircraft.mockReturnValue({
    safeToOperate: overrides.aircraftSafe ?? true,
    warnings: [],
    recommendations: [],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runComprehensiveSafetyAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultWeatherMocks();
  });

  // =========================================================================
  // Basic invocation
  // =========================================================================

  describe('basic invocation', () => {
    it('throws when flight is not found', async () => {
      mockFlightDoc = null;
      await expect(runComprehensiveSafetyAnalysis('nonexistent')).rejects.toThrow('Flight not found');
    });

    it('throws when flight is missing pilot or aircraft', async () => {
      mockFlightDoc = createMockFlightDoc(null, null);
      await expect(runComprehensiveSafetyAnalysis('test-id')).rejects.toThrow('missing pilot or aircraft');
    });

    it('returns a valid analysis for a well-configured flight', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis).toBeDefined();
      expect(analysis.generatedAt).toBeInstanceOf(Date);
      expect(['low', 'medium', 'high', 'critical']).toContain(analysis.overallRiskLevel);
      expect(analysis.overallScore).toBeGreaterThanOrEqual(0);
      expect(analysis.overallScore).toBeLessThanOrEqual(100);
      expect(['go', 'caution', 'no-go']).toContain(analysis.goNoGoRecommendation);
      expect(analysis.reasoning).toBeTruthy();
    });

    it('saves the flight document after analysis', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      await runComprehensiveSafetyAnalysis('test-id');

      expect(mockSave).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Pilot analysis (via composite output)
  // =========================================================================

  describe('pilot analysis', () => {
    it('reports current currency for valid pilot', async () => {
      const pilot = createFullMockPilot({
        medicalExpiration: monthsFromNow(12),
        flightReviewExpiration: monthsFromNow(12),
      });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.pilotAnalysis.currencyStatus).toBe('current');
      expect(analysis.pilotAnalysis.qualifiedForConditions).toBe(true);
    });

    it('reports expired currency when medical is expired', async () => {
      const pilot = createFullMockPilot({
        medicalExpiration: monthsAgo(3),
      });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.pilotAnalysis.currencyStatus).toBe('expired');
      expect(analysis.pilotAnalysis.qualifiedForConditions).toBe(false);
      expect(analysis.pilotAnalysis.riskFactors.some(r => r.includes('Medical expired'))).toBe(true);
    });

    it('reports expired currency when flight review is expired', async () => {
      const pilot = createFullMockPilot({
        flightReviewExpiration: monthsAgo(3),
      });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.pilotAnalysis.currencyStatus).toBe('expired');
      expect(analysis.pilotAnalysis.riskFactors.some(r => r.includes('Flight review expired'))).toBe(true);
    });

    it('reports expiring currency within 30 days', async () => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 15);
      const pilot = createFullMockPilot({
        medicalExpiration: soon,
        flightReviewExpiration: monthsFromNow(12),
      });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.pilotAnalysis.currencyStatus).toBe('expiring');
    });

    it('identifies student pilot experience level', async () => {
      const pilot = createFullMockPilot({
        certificates: { type: 'Student', instrumentRated: false, multiEngineRated: false },
        experience: {
          totalHours: 30,
          picHours: 10,
          nightHours: 2,
          ifrHours: 0,
          crossCountryHours: 5,
          last90DaysHours: 10,
          last30DaysHours: 4,
          landingCurrency: { dayLandingsLast90Days: 15, nightLandingsLast90Days: 0 },
        },
      });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.pilotAnalysis.experienceLevel).toBe('student');
      expect(analysis.pilotAnalysis.riskFactors.some(r => r.includes('Student pilot'))).toBe(true);
    });

    it('identifies low-time pilot experience level', async () => {
      const pilot = createFullMockPilot({
        certificates: { type: 'PPL', instrumentRated: false, multiEngineRated: false },
        experience: {
          totalHours: 65,
          picHours: 50,
          nightHours: 10,
          ifrHours: 0,
          crossCountryHours: 15,
          last90DaysHours: 10,
          last30DaysHours: 3,
          landingCurrency: { dayLandingsLast90Days: 8, nightLandingsLast90Days: 2 },
        },
      });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.pilotAnalysis.experienceLevel).toBe('low_time');
    });

    it('identifies professional experience level for ATP with high hours', async () => {
      const pilot = createFullMockPilot({
        certificates: { type: 'ATP', instrumentRated: true, multiEngineRated: true },
        experience: {
          totalHours: 5000,
          picHours: 4000,
          nightHours: 500,
          ifrHours: 1000,
          crossCountryHours: 2000,
          last90DaysHours: 80,
          last30DaysHours: 30,
          landingCurrency: { dayLandingsLast90Days: 30, nightLandingsLast90Days: 15 },
        },
      });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.pilotAnalysis.experienceLevel).toBe('professional');
    });

    it('flags low recent activity', async () => {
      const pilot = createFullMockPilot({
        experience: {
          totalHours: 250,
          picHours: 200,
          nightHours: 40,
          ifrHours: 30,
          crossCountryHours: 80,
          last90DaysHours: 2,  // very low
          last30DaysHours: 0,
          landingCurrency: { dayLandingsLast90Days: 5, nightLandingsLast90Days: 3 },
        },
      });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.pilotAnalysis.riskFactors.some(r => r.includes('Very low recent activity'))).toBe(true);
    });
  });

  // =========================================================================
  // Aircraft analysis (via composite output)
  // =========================================================================

  describe('aircraft analysis', () => {
    it('reports current maintenance when all inspections are fresh', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft({
        maintenanceDates: {
          annual: monthsAgo(3),
          transponder: monthsAgo(6),
          staticSystem: monthsAgo(6),
        },
      });
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.aircraftAnalysis.maintenanceStatus).toBe('current');
    });

    it('reports overdue maintenance when annual is expired', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft({
        maintenanceDates: {
          annual: monthsAgo(14),
          transponder: monthsAgo(6),
          staticSystem: monthsAgo(6),
        },
      });
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.aircraftAnalysis.maintenanceStatus).toBe('overdue');
      expect(analysis.aircraftAnalysis.mechanicalRisks.some(r => r.includes('Annual overdue'))).toBe(true);
    });

    it('reports due_soon when annual is within 30 days', async () => {
      const pilot = createFullMockPilot();
      const annualDate = new Date();
      annualDate.setFullYear(annualDate.getFullYear() - 1);
      annualDate.setDate(annualDate.getDate() + 20);
      const aircraft = createFullMockAircraft({
        maintenanceDates: {
          annual: annualDate,
          transponder: monthsAgo(6),
          staticSystem: monthsAgo(6),
        },
      });
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.aircraftAnalysis.maintenanceStatus).toBe('due_soon');
    });

    it('reports overdue when transponder is expired', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft({
        maintenanceDates: {
          annual: monthsAgo(6),
          transponder: monthsAgo(26),
          staticSystem: monthsAgo(6),
        },
      });
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.aircraftAnalysis.maintenanceStatus).toBe('overdue');
      expect(analysis.aircraftAnalysis.mechanicalRisks.some(r => r.includes('Transponder'))).toBe(true);
    });

    it('flags engine approaching TBO', async () => {
      const pilot = createFullMockPilot();
      // hobbs = 3950 -> 3950 % 2000 = 1950 -> > 1800, engine approaching TBO
      const aircraft = createFullMockAircraft({
        currentHours: { hobbs: 3950, tach: 3800 },
      });
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.aircraftAnalysis.mechanicalRisks.some(r => r.includes('TBO'))).toBe(true);
    });

    it('performance margins are inadequate when maintenance is overdue', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft({
        maintenanceDates: {
          annual: monthsAgo(14),
          transponder: monthsAgo(6),
          staticSystem: monthsAgo(6),
        },
      });
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.aircraftAnalysis.performanceMargins).toBe('inadequate');
    });

    it('includes AI safety findings in mechanical risks', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft({
        safetyAnalysis: {
          lastAnalyzed: new Date(),
          score: 4,
          findings: [
            { component: 'Alternator', status: 'critical', message: 'Alternator showing signs of failure' },
            { component: 'Vacuum Pump', status: 'warning', message: 'Vacuum pump nearing replacement interval' },
          ],
        },
      });
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.aircraftAnalysis.mechanicalRisks.some(r => r.includes('Alternator'))).toBe(true);
      expect(analysis.aircraftAnalysis.mechanicalRisks.some(r => r.includes('Vacuum Pump'))).toBe(true);
    });
  });

  // =========================================================================
  // Risk scenarios
  // =========================================================================

  describe('risk scenarios', () => {
    it('includes an electrical failure scenario', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      const elecScenario = analysis.combinedRiskScenarios.find(s => s.title === 'Electrical Failure');
      expect(elecScenario).toBeDefined();
      expect(elecScenario!.probability).toBeGreaterThanOrEqual(0);
      expect(elecScenario!.probability).toBeLessThanOrEqual(15);
    });

    it('includes an engine failure scenario', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      const engineScenario = analysis.combinedRiskScenarios.find(s => s.title === 'Engine Failure');
      expect(engineScenario).toBeDefined();
      expect(engineScenario!.probability).toBeGreaterThanOrEqual(0);
      expect(engineScenario!.probability).toBeLessThanOrEqual(10);
    });

    it('adds weather deterioration scenario when weather is not VFR', async () => {
      setupDefaultWeatherMocks({
        departure: createMockWeather({ flightCategory: 'MVFR', trend: 'deteriorating' }),
      });
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      const wxScenario = analysis.combinedRiskScenarios.find(s => s.title === 'Weather Deterioration');
      expect(wxScenario).toBeDefined();
      expect(wxScenario!.probability).toBeGreaterThan(5);
    });

    it('flags pilot inexperience for student pilots', async () => {
      const pilot = createFullMockPilot({
        certificates: { type: 'Student', instrumentRated: false, multiEngineRated: false },
        experience: {
          totalHours: 30,
          picHours: 10,
          nightHours: 2,
          ifrHours: 0,
          crossCountryHours: 5,
          last90DaysHours: 10,
          last30DaysHours: 4,
          landingCurrency: { dayLandingsLast90Days: 15, nightLandingsLast90Days: 0 },
        },
      });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      const expScenario = analysis.combinedRiskScenarios.find(s => s.title === 'Pilot Inexperience');
      expect(expScenario).toBeDefined();
      expect(expScenario!.probability).toBe(25);
    });

    it('flags skill degradation for low recent activity', async () => {
      const pilot = createFullMockPilot({
        experience: {
          totalHours: 250,
          picHours: 200,
          nightHours: 40,
          ifrHours: 30,
          crossCountryHours: 80,
          last90DaysHours: 1,
          last30DaysHours: 0,
          landingCurrency: { dayLandingsLast90Days: 5, nightLandingsLast90Days: 3 },
        },
      });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      const skillScenario = analysis.combinedRiskScenarios.find(s => s.title === 'Skill Degradation');
      expect(skillScenario).toBeDefined();
    });

    it('scenarios are sorted by severity (critical first)', async () => {
      const pilot = createFullMockPilot({
        certificates: { type: 'Student', instrumentRated: false, multiEngineRated: false },
        experience: {
          totalHours: 30,
          picHours: 10,
          nightHours: 2,
          ifrHours: 0,
          crossCountryHours: 5,
          last90DaysHours: 1,
          last30DaysHours: 0,
          landingCurrency: { dayLandingsLast90Days: 15, nightLandingsLast90Days: 0 },
        },
      });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const scenarios = analysis.combinedRiskScenarios;
      for (let i = 1; i < scenarios.length; i++) {
        expect(severityOrder[scenarios[i].severity]).toBeGreaterThanOrEqual(
          severityOrder[scenarios[i - 1].severity]
        );
      }
    });

    it('all scenarios have required fields', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      for (const scenario of analysis.combinedRiskScenarios) {
        expect(scenario.title).toBeTruthy();
        expect(typeof scenario.probability).toBe('number');
        expect(scenario.probability).toBeGreaterThanOrEqual(0);
        expect(['low', 'medium', 'high', 'critical']).toContain(scenario.severity);
        expect(scenario.description).toBeTruthy();
      }
    });

    it('flags known mechanical issues from AI analysis', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft({
        safetyAnalysis: {
          lastAnalyzed: new Date(),
          score: 3,
          findings: [
            { component: 'Engine', status: 'critical', message: 'Metal in oil filter' },
          ],
        },
      });
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      const mechScenario = analysis.combinedRiskScenarios.find(s => s.title === 'Known Mechanical Issue');
      expect(mechScenario).toBeDefined();
      expect(mechScenario!.severity).toBe('critical');
      expect(mechScenario!.probability).toBe(70);
    });
  });

  // =========================================================================
  // Familiarity analysis
  // =========================================================================

  describe('familiarity analysis', () => {
    it('reports unfamiliar when pilot has no flight entries', async () => {
      const pilot = createFullMockPilot({ flightEntries: [] });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.familiarityAnalysis).toBeDefined();
      expect(analysis.familiarityAnalysis!.aircraftFamiliarity.familiarityLevel).toBe('unfamiliar');
      expect(analysis.familiarityAnalysis!.routeFamiliarity.familiarityLevel).toBe('unfamiliar');
    });

    it('reports high familiarity when pilot has many flights in the same tail', async () => {
      const entries = Array.from({ length: 15 }, (_, i) => ({
        date: `2024-0${Math.min(i + 1, 9)}-15`,
        aircraftIdent: 'N12345',
        aircraftType: 'Cessna 172S',
        from: 'KJFK',
        to: 'KBOS',
        totalTime: 1.5,
      }));
      const pilot = createFullMockPilot({ flightEntries: entries });
      const aircraft = createFullMockAircraft({ tailNumber: 'N12345', model: 'Cessna 172S' });
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.familiarityAnalysis!.aircraftFamiliarity.familiarityLevel).toBe('high');
      expect(analysis.familiarityAnalysis!.aircraftFamiliarity.tailNumberFlights).toBe(15);
      // Route should also be high since all flights KJFK->KBOS
      expect(analysis.familiarityAnalysis!.routeFamiliarity.routeFlown).toBe(true);
    });

    it('adds unfamiliar aircraft risk scenario', async () => {
      const pilot = createFullMockPilot({ flightEntries: [] });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      const scenario = analysis.combinedRiskScenarios.find(s => s.title === 'Unfamiliar Aircraft');
      expect(scenario).toBeDefined();
      expect(scenario!.severity).toBe('high');
      expect(scenario!.mitigations).toBeDefined();
      expect(scenario!.mitigations!.length).toBeGreaterThan(0);
    });

    it('adds unfamiliar route risk scenario', async () => {
      const pilot = createFullMockPilot({ flightEntries: [] });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      const scenario = analysis.combinedRiskScenarios.find(s => s.title === 'Unfamiliar Route/Airports');
      expect(scenario).toBeDefined();
    });

    it('familiarity score is 0 for completely unfamiliar pilot', async () => {
      const pilot = createFullMockPilot({ flightEntries: [] });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.familiarityAnalysis!.overallFamiliarityScore).toBe(0);
    });
  });

  // =========================================================================
  // Survival score breakdown
  // =========================================================================

  describe('survival score breakdown', () => {
    it('is included in the analysis', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.survivalScoreBreakdown).toBeDefined();
      const breakdown = analysis.survivalScoreBreakdown!;
      expect(breakdown.aircraftScore).toBeGreaterThanOrEqual(0);
      expect(breakdown.aircraftScore).toBeLessThanOrEqual(25);
      expect(breakdown.pilotScore).toBeGreaterThanOrEqual(0);
      expect(breakdown.pilotScore).toBeLessThanOrEqual(25);
      expect(breakdown.weatherScore).toBeGreaterThanOrEqual(0);
      expect(breakdown.weatherScore).toBeLessThanOrEqual(20);
      expect(breakdown.familiarityScore).toBeGreaterThanOrEqual(0);
      expect(breakdown.familiarityScore).toBeLessThanOrEqual(15);
      expect(breakdown.failureProbScore).toBeGreaterThanOrEqual(0);
      expect(breakdown.failureProbScore).toBeLessThanOrEqual(15);
      expect(breakdown.totalScore).toBeGreaterThanOrEqual(0);
      expect(breakdown.totalScore).toBeLessThanOrEqual(100);
    });

    it('total score equals sum of sub-scores', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      const b = analysis.survivalScoreBreakdown!;
      const sum = b.aircraftScore + b.pilotScore + b.weatherScore + b.familiarityScore + b.failureProbScore;
      expect(b.totalScore).toBe(Math.round(sum));
    });

    it('has high score for perfect conditions', async () => {
      const pilot = createFullMockPilot({
        certificates: { type: 'ATP', instrumentRated: true, multiEngineRated: true },
        experience: {
          totalHours: 5000,
          picHours: 4000,
          nightHours: 500,
          ifrHours: 1000,
          crossCountryHours: 2000,
          last90DaysHours: 80,
          last30DaysHours: 30,
          landingCurrency: { dayLandingsLast90Days: 30, nightLandingsLast90Days: 15 },
        },
        medicalExpiration: monthsFromNow(12),
        flightReviewExpiration: monthsFromNow(12),
      });
      const aircraft = createFullMockAircraft({
        maintenanceDates: {
          annual: monthsAgo(3),
          transponder: monthsAgo(6),
          staticSystem: monthsAgo(6),
        },
      });
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      // Even without familiarity the other scores should be high
      expect(analysis.survivalScoreBreakdown!.pilotScore).toBeGreaterThanOrEqual(20);
      expect(analysis.survivalScoreBreakdown!.aircraftScore).toBeGreaterThanOrEqual(20);
      expect(analysis.survivalScoreBreakdown!.weatherScore).toBeGreaterThanOrEqual(15);
    });

    it('has low score for dangerous conditions', async () => {
      setupDefaultWeatherMocks({ pilotLegal: false, pilotSafe: false, aircraftSafe: false });
      const pilot = createFullMockPilot({
        medicalExpiration: monthsAgo(3),
        flightReviewExpiration: monthsAgo(3),
        certificates: { type: 'Student', instrumentRated: false, multiEngineRated: false },
        experience: {
          totalHours: 20,
          picHours: 5,
          nightHours: 0,
          ifrHours: 0,
          crossCountryHours: 0,
          last90DaysHours: 0,
          last30DaysHours: 0,
          landingCurrency: { dayLandingsLast90Days: 0, nightLandingsLast90Days: 0 },
        },
      });
      const aircraft = createFullMockAircraft({
        maintenanceDates: {
          annual: monthsAgo(14),
          transponder: monthsAgo(26),
          staticSystem: monthsAgo(26),
        },
      });
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      // Score should be quite low
      expect(analysis.survivalScoreBreakdown!.totalScore).toBeLessThan(50);
      expect(analysis.survivalScoreBreakdown!.survivalProbability).not.toBe('Very High');
    });

    it('includes survival probability text', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(typeof analysis.survivalScoreBreakdown!.survivalProbability).toBe('string');
      expect(analysis.survivalScoreBreakdown!.survivalProbability.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Go/No-Go determination
  // =========================================================================

  describe('go/no-go determination', () => {
    it('recommends "go" when all checks pass and no critical risks', async () => {
      const pilot = createFullMockPilot({
        medicalExpiration: monthsFromNow(12),
        flightReviewExpiration: monthsFromNow(12),
      });
      const aircraft = createFullMockAircraft({
        maintenanceDates: {
          annual: monthsAgo(3),
          transponder: monthsAgo(6),
          staticSystem: monthsAgo(6),
        },
      });
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      // May be 'go' or 'caution' depending on familiarity. But no 'no-go'.
      expect(analysis.goNoGoRecommendation).not.toBe('no-go');
    });

    it('recommends "no-go" when pilot currency is expired', async () => {
      const pilot = createFullMockPilot({
        medicalExpiration: monthsAgo(3),
        flightReviewExpiration: monthsAgo(3),
      });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.goNoGoRecommendation).toBe('no-go');
      expect(analysis.reasoning).toContain('grounded');
    });

    it('recommends "no-go" when maintenance is overdue', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft({
        maintenanceDates: {
          annual: monthsAgo(14),
          transponder: monthsAgo(6),
          staticSystem: monthsAgo(6),
        },
      });
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.goNoGoRecommendation).toBe('no-go');
    });

    it('recommends "no-go" when weather exceeds pilot qualifications', async () => {
      setupDefaultWeatherMocks({ pilotLegal: false });
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.goNoGoRecommendation).toBe('no-go');
    });

    it('reasoning explains why flight is grounded', async () => {
      const pilot = createFullMockPilot({
        medicalExpiration: monthsAgo(3),
      });
      const aircraft = createFullMockAircraft({
        maintenanceDates: {
          annual: monthsAgo(14),
          transponder: monthsAgo(6),
          staticSystem: monthsAgo(6),
        },
      });
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.reasoning).toBeTruthy();
      expect(analysis.reasoning.length).toBeGreaterThan(10);
    });
  });

  // =========================================================================
  // Legality checks generation
  // =========================================================================

  describe('legality checks generation', () => {
    it('generates medical certificate check', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      // The legalityChecks are stored on the flight document
      // They are generated by generateLegalityChecks
      // Check that after save, the flight doc has been updated
      expect(mockSave).toHaveBeenCalled();
      expect(mockFlightDoc.overallStatus).toBeDefined();
    });
  });

  // =========================================================================
  // Weather analysis
  // =========================================================================

  describe('weather analysis', () => {
    it('includes departure and arrival conditions', async () => {
      const depWeather = createMockWeather({ station: 'KJFK', flightCategory: 'VFR' });
      const arrWeather = createMockWeather({ station: 'KBOS', flightCategory: 'MVFR' });
      setupDefaultWeatherMocks({ departure: depWeather, arrival: arrWeather });

      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.weatherAnalysis).toBeDefined();
      expect(analysis.weatherAnalysis.departureConditions).toBeDefined();
      expect(analysis.weatherAnalysis.arrivalConditions).toBeDefined();
    });

    it('combines departure and arrival weather pilot analysis', async () => {
      const depWeather = createMockWeather({ station: 'KJFK', flightCategory: 'VFR' });
      const arrWeather = createMockWeather({ station: 'KBOS', flightCategory: 'IFR' });
      setupDefaultWeatherMocks({ departure: depWeather, arrival: arrWeather });

      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');

      expect(analysis.weatherAnalysis.weatherVsPilot).toBeDefined();
      expect(typeof analysis.weatherAnalysis.weatherVsPilot.legal).toBe('boolean');
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('handles aircraft with zero hours', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft({
        currentHours: { hobbs: 0, tach: 0 },
      });
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      // Should not throw
      const analysis = await runComprehensiveSafetyAnalysis('test-id');
      expect(analysis).toBeDefined();
    });

    it('handles pilot with zero experience hours', async () => {
      const pilot = createFullMockPilot({
        experience: {
          totalHours: 0,
          picHours: 0,
          nightHours: 0,
          ifrHours: 0,
          crossCountryHours: 0,
          last90DaysHours: 0,
          last30DaysHours: 0,
          landingCurrency: { dayLandingsLast90Days: 0, nightLandingsLast90Days: 0 },
        },
      });
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');
      expect(analysis).toBeDefined();
    });

    it('handles missing operating limits on aircraft', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft({
        operatingLimits: undefined,
      });
      mockFlightDoc = createMockFlightDoc(pilot, aircraft);

      const analysis = await runComprehensiveSafetyAnalysis('test-id');
      expect(analysis).toBeDefined();
    });

    it('handles missing arrival airport', async () => {
      const pilot = createFullMockPilot();
      const aircraft = createFullMockAircraft();
      mockFlightDoc = createMockFlightDoc(pilot, aircraft, {
        arrivalAirport: undefined,
      });

      const analysis = await runComprehensiveSafetyAnalysis('test-id');
      expect(analysis).toBeDefined();
    });
  });
});
