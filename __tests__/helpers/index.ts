import mongoose from 'mongoose';
import type { IEnhancedWeatherData, IWeatherHazard } from '@/lib/services/weatherService';
import type { IAircraft } from '@/lib/models/Aircraft';
import type { IPilot, ICertificate, IExperience, IEndorsement, IFlightEntry } from '@/lib/models/Pilot';
import type { IWeatherData } from '@/lib/models/Flight';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
export function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export function monthsFromNow(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d;
}

export function monthsAgo(months: number): Date {
  return monthsFromNow(-months);
}

export function daysAgo(days: number): Date {
  return daysFromNow(-days);
}

/**
 * Creates a mock IEnhancedWeatherData object with sensible defaults.
 * Override any field by passing partial data.
 */
export function createMockWeather(
  overrides: Partial<IEnhancedWeatherData> = {}
): IEnhancedWeatherData {
  return {
    station: 'KLAX',
    metar: 'KLAX 091853Z 25010KT 10SM FEW025 SCT040 20/12 A3001',
    flightCategory: 'VFR',
    visibility: 10,
    ceiling: undefined,
    wind: {
      direction: 250,
      speed: 10,
      gust: undefined,
    },
    temperature: 20,
    dewpoint: 12,
    altimeter: 30.01,
    densityAltitude: 1200,
    pressureAltitude: 300,
    observationTime: new Date('2025-01-09T18:53:00Z'),
    trend: 'stable',
    hazards: [],
    fetchedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a mock IWeatherData (the simpler shape used by legalityService).
 */
export function createSimpleWeather(
  overrides: Partial<IWeatherData> = {}
): IWeatherData {
  return {
    station: 'KJFK',
    metar: 'KJFK 081856Z 36010KT 10SM FEW250 22/11 A3001 RMK AO2',
    flightCategory: 'VFR',
    visibility: 10,
    ceiling: undefined,
    wind: { direction: 360, speed: 10 },
    fetchedAt: new Date(),
    ...overrides,
  } as IWeatherData;
}

/**
 * Creates a mock aircraft object matching the parameter shape of analyzeWeatherVsAircraft.
 */
export function createMockAircraft(
  overrides: Partial<{
    operatingLimits: {
      vSpeeds?: { va?: number };
      weights?: { maxGross?: number };
    };
    model: string;
  }> = {}
) {
  return {
    model: 'Cessna 172S',
    operatingLimits: {
      vSpeeds: { va: 99 },
      weights: { maxGross: 2550 },
    },
    ...overrides,
  };
}

/**
 * Full IAircraft mock for legality/safety service tests.
 */
export function createFullMockAircraft(overrides: Record<string, any> = {}): IAircraft {
  const now = new Date();
  return {
    _id: new mongoose.Types.ObjectId(),
    userId: 'user-test-123',
    tailNumber: 'N12345',
    model: 'Cessna 172S',
    serial: '172S12345',
    manufacturer: 'Cessna',
    year: 2005,
    maintenanceDates: {
      annual: monthsAgo(6),
      transponder: monthsAgo(12),
      staticSystem: monthsAgo(12),
    },
    currentHours: {
      hobbs: 1234.5,
      tach: 1200.3,
    },
    logs: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as unknown as IAircraft;
}

/**
 * Creates a mock pilot object matching the parameter shape of analyzeWeatherVsPilot.
 */
export function createMockPilot(
  overrides: Partial<{
    certificates: { instrumentRated?: boolean; type?: string };
    experience: {
      totalHours?: number;
      nightHours?: number;
      ifrHours?: number;
      crossCountryHours?: number;
    };
    endorsements: { type: string }[];
  }> = {}
) {
  return {
    certificates: {
      instrumentRated: true,
      type: 'Private',
    },
    experience: {
      totalHours: 500,
      nightHours: 50,
      ifrHours: 100,
      crossCountryHours: 200,
    },
    endorsements: [] as { type: string }[],
    ...overrides,
  };
}

/**
 * Full IPilot mock for legality/safety service tests.
 */
export function createFullMockPilot(overrides: Record<string, any> = {}): IPilot {
  const now = new Date();
  return {
    _id: new mongoose.Types.ObjectId(),
    userId: 'user-test-123',
    name: 'John Doe',
    email: 'john@example.com',
    certificates: {
      type: 'PPL',
      instrumentRated: true,
      multiEngineRated: false,
    },
    endorsements: [],
    experience: {
      totalHours: 250,
      picHours: 200,
      nightHours: 40,
      ifrHours: 30,
      crossCountryHours: 80,
      last90DaysHours: 15,
      last30DaysHours: 5,
      landingCurrency: {
        dayLandingsLast90Days: 10,
        nightLandingsLast90Days: 5,
      },
      ifrCurrency: {
        approachesLast6Months: 8,
        holdingLast6Months: true,
        interceptingTrackingLast6Months: true,
      },
    },
    flightEntries: [],
    linkedDocuments: [],
    medicalClass: '3rd',
    medicalExpiration: monthsFromNow(6),
    flightReviewExpiration: monthsFromNow(6),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as unknown as IPilot;
}

/**
 * Creates a mock METAR API response (aviationweather.gov JSON format).
 */
export function createMockMetarApiResponse(overrides: Record<string, unknown> = {}) {
  return {
    rawOb: 'KLAX 091853Z 25010KT 10SM FEW025 SCT040 20/12 A3001',
    visib: 10,
    wdir: 250,
    wspd: 10,
    wgst: undefined,
    clouds: [
      { cover: 'FEW', base: 2500 },
      { cover: 'SCT', base: 4000 },
    ],
    temp: 20,
    dewp: 12,
    altim: 1017.0,
    elev: 126,
    obsTime: 1704825180,
    wxString: '',
    ...overrides,
  };
}

/**
 * Helper to create a mock fetch Response.
 */
export function createMockFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
    headers: new Headers(),
    redirected: false,
    statusText: ok ? 'OK' : 'Error',
    type: 'basic' as ResponseType,
    url: '',
    clone: () => createMockFetchResponse(body, ok, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    bytes: async () => new Uint8Array(),
  } as Response;
}
