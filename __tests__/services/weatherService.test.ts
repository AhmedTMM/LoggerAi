import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  analyzeWeatherVsAircraft,
  analyzeWeatherVsPilot,
  fetchWeatherData,
  fetchEnhancedWeatherData,
  type IEnhancedWeatherData,
} from '@/lib/services/weatherService';
import {
  createMockWeather,
  createMockAircraft,
  createMockPilot,
  createMockMetarApiResponse,
  createMockFetchResponse,
} from '@/__tests__/helpers';

// ============================================================================
// NOTE: determineFlightCategory, findCeiling, parseWeatherHazards,
// sanitizeVisibility, sanitizeWindDirection, sanitizeWindSpeed,
// flightCategoryToNumber, and parseTAFPeriods are NOT exported from the
// weather service. They are tested INDIRECTLY through the exported functions
// fetchWeatherData and fetchEnhancedWeatherData (which require mocking fetch)
// and through analyzeWeatherVsAircraft / analyzeWeatherVsPilot (which consume
// the results of those internal functions).
// ============================================================================

// ---------------------------------------------------------------------------
// determineFlightCategory (tested indirectly via fetchWeatherData)
// ---------------------------------------------------------------------------
describe('determineFlightCategory (via fetchWeatherData)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns VFR when visibility > 5sm and no ceiling', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [{ cover: 'FEW', base: 5000 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.flightCategory).toBe('VFR');
  });

  it('returns VFR when visibility > 5sm and ceiling > 3000ft', async () => {
    const metar = createMockMetarApiResponse({
      visib: 8,
      clouds: [{ cover: 'BKN', base: 5000 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.flightCategory).toBe('VFR');
  });

  it('returns MVFR when visibility is between 3 and 5sm', async () => {
    const metar = createMockMetarApiResponse({
      visib: 4,
      clouds: [{ cover: 'FEW', base: 8000 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.flightCategory).toBe('MVFR');
  });

  it('returns MVFR when ceiling is between 1000 and 3000ft', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [{ cover: 'BKN', base: 2500 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.flightCategory).toBe('MVFR');
  });

  it('returns IFR when visibility is between 1 and 3sm', async () => {
    const metar = createMockMetarApiResponse({
      visib: 2,
      clouds: [{ cover: 'FEW', base: 8000 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.flightCategory).toBe('IFR');
  });

  it('returns IFR when ceiling is between 500 and 1000ft', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [{ cover: 'OVC', base: 800 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.flightCategory).toBe('IFR');
  });

  it('returns LIFR when visibility < 1sm', async () => {
    const metar = createMockMetarApiResponse({
      visib: 0.5,
      clouds: [{ cover: 'FEW', base: 8000 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.flightCategory).toBe('LIFR');
  });

  it('returns LIFR when ceiling < 500ft', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [{ cover: 'OVC', base: 200 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.flightCategory).toBe('LIFR');
  });

  // -- Boundary edge cases --

  it('returns MVFR at exactly 3sm visibility (boundary: 3 < 5 is MVFR)', async () => {
    const metar = createMockMetarApiResponse({
      visib: 3,
      clouds: [],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    // 3 is not < 3 so not IFR; 3 < 5 so MVFR
    expect(result!.flightCategory).toBe('MVFR');
  });

  it('returns VFR at exactly 5sm visibility (boundary: 5 is not < 5)', async () => {
    const metar = createMockMetarApiResponse({
      visib: 5,
      clouds: [],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    // 5 is not < 5 so VFR
    expect(result!.flightCategory).toBe('VFR');
  });

  it('returns IFR at exactly 1sm visibility (boundary: 1 is not < 1)', async () => {
    const metar = createMockMetarApiResponse({
      visib: 1,
      clouds: [],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    // 1 is not < 1 so not LIFR; 1 < 3 so IFR
    expect(result!.flightCategory).toBe('IFR');
  });

  it('returns IFR at ceiling exactly 500ft (boundary: 500 is not < 500)', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [{ cover: 'OVC', base: 500 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    // 500 is not < 500 (not LIFR), but 500 < 1000 so IFR
    expect(result!.flightCategory).toBe('IFR');
  });

  it('returns MVFR at ceiling exactly 1000ft (boundary: 1000 is not < 1000)', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [{ cover: 'BKN', base: 1000 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    // 1000 is not < 1000 (not IFR), but 1000 < 3000 so MVFR
    expect(result!.flightCategory).toBe('MVFR');
  });

  it('returns VFR at ceiling exactly 3000ft (boundary: 3000 is not < 3000)', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [{ cover: 'OVC', base: 3000 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    // 3000 is not < 3000 so VFR
    expect(result!.flightCategory).toBe('VFR');
  });

  it('returns LIFR when both visibility and ceiling are extremely low', async () => {
    const metar = createMockMetarApiResponse({
      visib: 0.25,
      clouds: [{ cover: 'OVC', base: 100 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.flightCategory).toBe('LIFR');
  });

  it('handles ceiling check taking priority over visibility when ceiling is worse', async () => {
    // Visibility is VFR (10sm) but ceiling is LIFR (200ft) -- LIFR wins
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [{ cover: 'BKN', base: 200 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.flightCategory).toBe('LIFR');
  });

  it('handles visibility check taking priority when visibility is worse', async () => {
    // Ceiling is VFR (5000ft BKN) but visibility is LIFR (0.5sm)
    const metar = createMockMetarApiResponse({
      visib: 0.5,
      clouds: [{ cover: 'BKN', base: 5000 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.flightCategory).toBe('LIFR');
  });
});

// ---------------------------------------------------------------------------
// findCeiling (tested indirectly via fetchWeatherData)
// ---------------------------------------------------------------------------
describe('findCeiling (via fetchWeatherData)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns undefined ceiling when clouds array is empty', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.ceiling).toBeUndefined();
  });

  it('returns undefined ceiling when only FEW layers present', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [
        { cover: 'FEW', base: 2500 },
        { cover: 'FEW', base: 5000 },
      ],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.ceiling).toBeUndefined();
  });

  it('returns undefined ceiling when only SCT layers present', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [
        { cover: 'SCT', base: 2500 },
        { cover: 'SCT', base: 4500 },
      ],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.ceiling).toBeUndefined();
  });

  it('returns BKN layer altitude as ceiling', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [
        { cover: 'FEW', base: 1500 },
        { cover: 'BKN', base: 3500 },
      ],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.ceiling).toBe(3500);
  });

  it('returns OVC layer altitude as ceiling', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [
        { cover: 'FEW', base: 1500 },
        { cover: 'OVC', base: 4000 },
      ],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.ceiling).toBe(4000);
  });

  it('picks the first BKN/OVC layer (lowest in array order) as ceiling', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [
        { cover: 'FEW', base: 1000 },
        { cover: 'BKN', base: 2500 },
        { cover: 'OVC', base: 5000 },
      ],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    // findCeiling iterates and returns the first BKN/OVC it finds
    expect(result!.ceiling).toBe(2500);
  });

  it('ignores FEW and SCT layers and picks the BKN layer', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [
        { cover: 'FEW', base: 500 },
        { cover: 'SCT', base: 1500 },
        { cover: 'BKN', base: 8000 },
      ],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.ceiling).toBe(8000);
  });

  it('returns undefined when clouds is undefined', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: undefined,
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.ceiling).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// sanitizeVisibility (tested indirectly via fetchWeatherData)
// ---------------------------------------------------------------------------
describe('sanitizeVisibility (via fetchWeatherData)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles numeric visibility value', async () => {
    const metar = createMockMetarApiResponse({ visib: 7, clouds: [] });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.visibility).toBe(7);
  });

  it('handles string visibility value like "10+"', async () => {
    const metar = createMockMetarApiResponse({ visib: '10+', clouds: [] });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.visibility).toBe(10);
  });

  it('handles non-numeric string visibility by defaulting to 10', async () => {
    const metar = createMockMetarApiResponse({ visib: 'P6SM', clouds: [] });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    // 'P6SM' -> parseFloat('6') = 6
    expect(result!.visibility).toBe(6);
  });

  it('defaults to 10 when visibility is undefined', async () => {
    const metar = createMockMetarApiResponse({ visib: undefined, clouds: [] });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.visibility).toBe(10);
  });

  it('handles fractional visibility like 0.5', async () => {
    const metar = createMockMetarApiResponse({ visib: 0.5, clouds: [] });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.visibility).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// sanitizeWindDirection and sanitizeWindSpeed (via fetchWeatherData)
// ---------------------------------------------------------------------------
describe('wind sanitization (via fetchWeatherData)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles numeric wind direction and speed', async () => {
    const metar = createMockMetarApiResponse({
      wdir: 270,
      wspd: 15,
      wgst: 25,
      clouds: [],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.wind.direction).toBe(270);
    expect(result!.wind.speed).toBe(15);
    expect(result!.wind.gust).toBe(25);
  });

  it('handles VRB wind direction by converting to 0', async () => {
    const metar = createMockMetarApiResponse({
      wdir: 'VRB',
      wspd: 5,
      clouds: [],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.wind.direction).toBe(0);
  });

  it('returns undefined gust when wgst is not present', async () => {
    const metar = createMockMetarApiResponse({
      wdir: 180,
      wspd: 10,
      wgst: undefined,
      clouds: [],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.wind.gust).toBeUndefined();
  });

  it('handles string wind speed', async () => {
    const metar = createMockMetarApiResponse({
      wdir: 180,
      wspd: '12',
      clouds: [],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.wind.speed).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// parseWeatherHazards (tested indirectly via fetchEnhancedWeatherData)
// ---------------------------------------------------------------------------
describe('parseWeatherHazards (via fetchEnhancedWeatherData)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects thunderstorm hazard from wxString containing TS', async () => {
    const metar = createMockMetarApiResponse({
      wxString: '+TSRA',
      visib: 3,
      clouds: [{ cover: 'OVC', base: 2000 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchEnhancedWeatherData('KLAX');
    expect(result).not.toBeNull();
    const tsHazard = result!.hazards?.find(h => h.type === 'CONVECTIVE');
    expect(tsHazard).toBeDefined();
    expect(tsHazard!.severity).toBe('extreme');
    expect(tsHazard!.description).toContain('Thunderstorm');
  });

  it('detects thunderstorm hazard from wxString containing CB', async () => {
    const metar = createMockMetarApiResponse({
      wxString: 'CB',
      visib: 5,
      clouds: [{ cover: 'BKN', base: 3000 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchEnhancedWeatherData('KLAX');
    expect(result).not.toBeNull();
    const tsHazard = result!.hazards?.find(h => h.type === 'CONVECTIVE');
    expect(tsHazard).toBeDefined();
  });

  it('detects freezing precipitation from wxString containing FZ', async () => {
    const metar = createMockMetarApiResponse({
      wxString: 'FZRA',
      visib: 3,
      clouds: [{ cover: 'OVC', base: 1500 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchEnhancedWeatherData('KLAX');
    expect(result).not.toBeNull();
    const fzHazard = result!.hazards?.find(h => h.description.includes('Freezing'));
    expect(fzHazard).toBeDefined();
    expect(fzHazard!.severity).toBe('high');
  });

  it('detects low visibility hazard from fog with visibility < 3sm', async () => {
    const metar = createMockMetarApiResponse({
      wxString: 'FG',
      visib: 0.5,
      clouds: [{ cover: 'OVC', base: 200 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchEnhancedWeatherData('KLAX');
    expect(result).not.toBeNull();
    const visHazard = result!.hazards?.find(h => h.description.includes('Reduced visibility'));
    expect(visHazard).toBeDefined();
    expect(visHazard!.severity).toBe('high'); // vis < 1 => high
  });

  it('detects low visibility hazard from mist (BR) with visibility < 3sm', async () => {
    const metar = createMockMetarApiResponse({
      wxString: 'BR',
      visib: 2,
      clouds: [{ cover: 'OVC', base: 800 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchEnhancedWeatherData('KLAX');
    expect(result).not.toBeNull();
    const visHazard = result!.hazards?.find(h => h.description.includes('Reduced visibility'));
    expect(visHazard).toBeDefined();
    expect(visHazard!.severity).toBe('medium'); // 1 <= vis < 3 => medium
  });

  it('does NOT flag low visibility hazard if visibility >= 3sm even with FG/BR/HZ', async () => {
    const metar = createMockMetarApiResponse({
      wxString: 'HZ',
      visib: 4,
      clouds: [],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchEnhancedWeatherData('KLAX');
    expect(result).not.toBeNull();
    const visHazard = result!.hazards?.find(h => h.description.includes('Reduced visibility'));
    expect(visHazard).toBeUndefined();
  });

  it('detects strong wind hazard when wind speed >= 25kt', async () => {
    const metar = createMockMetarApiResponse({
      wxString: '',
      visib: 10,
      wspd: 28,
      wgst: undefined,
      clouds: [],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchEnhancedWeatherData('KLAX');
    expect(result).not.toBeNull();
    const windHazard = result!.hazards?.find(h => h.description.includes('Strong winds'));
    expect(windHazard).toBeDefined();
    expect(windHazard!.severity).toBe('medium'); // gust < 40
  });

  it('detects strong wind hazard when gusts >= 35kt', async () => {
    const metar = createMockMetarApiResponse({
      wxString: '',
      visib: 10,
      wspd: 20,
      wgst: 38,
      clouds: [],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchEnhancedWeatherData('KLAX');
    expect(result).not.toBeNull();
    const windHazard = result!.hazards?.find(h => h.description.includes('Strong winds'));
    expect(windHazard).toBeDefined();
    expect(windHazard!.severity).toBe('medium'); // gust 38 < 40
  });

  it('flags high severity wind hazard when gusts >= 40kt', async () => {
    const metar = createMockMetarApiResponse({
      wxString: '',
      visib: 10,
      wspd: 25,
      wgst: 45,
      clouds: [],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchEnhancedWeatherData('KLAX');
    expect(result).not.toBeNull();
    const windHazard = result!.hazards?.find(h => h.description.includes('Strong winds'));
    expect(windHazard).toBeDefined();
    expect(windHazard!.severity).toBe('high'); // gust >= 40
  });

  it('returns no hazards for calm clear weather', async () => {
    const metar = createMockMetarApiResponse({
      wxString: '',
      visib: 10,
      wspd: 5,
      wgst: undefined,
      clouds: [{ cover: 'FEW', base: 5000 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchEnhancedWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.hazards).toEqual([]);
  });

  it('detects multiple hazards simultaneously', async () => {
    // Thunderstorm + freezing precip + strong wind
    const metar = createMockMetarApiResponse({
      wxString: 'TSRA FZRA',
      visib: 2,
      wspd: 30,
      wgst: 42,
      clouds: [{ cover: 'OVC', base: 500 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchEnhancedWeatherData('KLAX');
    expect(result).not.toBeNull();
    // Should have at least TS, FZ, and wind hazards
    expect(result!.hazards!.length).toBeGreaterThanOrEqual(3);
    expect(result!.hazards!.some(h => h.type === 'CONVECTIVE')).toBe(true);
    expect(result!.hazards!.some(h => h.description.includes('Freezing'))).toBe(true);
    expect(result!.hazards!.some(h => h.description.includes('Strong winds'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchWeatherData - error handling and edge cases
// ---------------------------------------------------------------------------
describe('fetchWeatherData', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when API returns non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      createMockFetchResponse(null, false, 500)
    );

    const result = await fetchWeatherData('KLAX');
    expect(result).toBeNull();
  });

  it('returns null when API returns empty array', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([]));

    const result = await fetchWeatherData('KLAX');
    expect(result).toBeNull();
  });

  it('returns null when fetch throws an error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchWeatherData('KLAX');
    expect(result).toBeNull();
  });

  it('normalizes 3-letter airport code by prepending K', async () => {
    const metar = createMockMetarApiResponse({ visib: 10, clouds: [] });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('LAX');
    expect(result).not.toBeNull();
    expect(result!.station).toBe('KLAX');
    // Verify the fetch URL includes KLAX
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('KLAX')
    );
  });

  it('handles 4-letter airport code without modification', async () => {
    const metar = createMockMetarApiResponse({ visib: 10, clouds: [] });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('EGLL');
    expect(result).not.toBeNull();
    expect(result!.station).toBe('EGLL');
  });

  it('returns null when API returns empty text', async () => {
    const emptyResponse = {
      ok: true,
      status: 200,
      text: async () => '',
      headers: new Headers(),
      redirected: false,
      statusText: 'OK',
      type: 'basic' as ResponseType,
      url: '',
      clone: () => emptyResponse,
      body: null,
      bodyUsed: false,
      arrayBuffer: async () => new ArrayBuffer(0),
      blob: async () => new Blob(),
      formData: async () => new FormData(),
      json: async () => null,
      bytes: async () => new Uint8Array(),
    } as Response;
    vi.mocked(fetch).mockResolvedValueOnce(emptyResponse);

    const result = await fetchWeatherData('KLAX');
    expect(result).toBeNull();
  });

  it('populates all expected fields from a complete METAR response', async () => {
    const metar = createMockMetarApiResponse({
      rawOb: 'KJFK 091853Z 36015G25KT 2SM +RA BR OVC005 08/07 A2978',
      visib: 2,
      wdir: 360,
      wspd: 15,
      wgst: 25,
      clouds: [{ cover: 'OVC', base: 500 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchWeatherData('KJFK');
    expect(result).not.toBeNull();
    expect(result!.station).toBe('KJFK');
    expect(result!.metar).toBe('KJFK 091853Z 36015G25KT 2SM +RA BR OVC005 08/07 A2978');
    expect(result!.flightCategory).toBe('IFR');
    expect(result!.visibility).toBe(2);
    expect(result!.ceiling).toBe(500);
    expect(result!.wind.direction).toBe(360);
    expect(result!.wind.speed).toBe(15);
    expect(result!.wind.gust).toBe(25);
    expect(result!.fetchedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// fetchEnhancedWeatherData - density altitude and trend
// ---------------------------------------------------------------------------
describe('fetchEnhancedWeatherData - density altitude and trend', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calculates density altitude and pressure altitude when data is available', async () => {
    const metar = createMockMetarApiResponse({
      altim: 1013.25, // mb
      elev: 126,
      temp: 35, // Hot day
      visib: 10,
      clouds: [],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchEnhancedWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.pressureAltitude).toBeDefined();
    expect(result!.densityAltitude).toBeDefined();
    expect(typeof result!.densityAltitude).toBe('number');
    expect(typeof result!.pressureAltitude).toBe('number');
  });

  it('determines improving trend when current is better than previous', async () => {
    // Two observations: current (VFR) vs previous (IFR)
    const currentMetar = createMockMetarApiResponse({
      visib: 10,
      clouds: [{ cover: 'FEW', base: 5000 }],
    });
    const previousMetar = createMockMetarApiResponse({
      visib: 2,
      clouds: [{ cover: 'OVC', base: 800 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      createMockFetchResponse([currentMetar, previousMetar])
    );

    const result = await fetchEnhancedWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.trend).toBe('improving');
  });

  it('determines deteriorating trend when current is worse than previous', async () => {
    const currentMetar = createMockMetarApiResponse({
      visib: 1,
      clouds: [{ cover: 'OVC', base: 300 }],
    });
    const previousMetar = createMockMetarApiResponse({
      visib: 10,
      clouds: [{ cover: 'FEW', base: 5000 }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      createMockFetchResponse([currentMetar, previousMetar])
    );

    const result = await fetchEnhancedWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.trend).toBe('deteriorating');
  });

  it('determines stable trend when current matches previous', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [],
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      createMockFetchResponse([metar, metar])
    );

    const result = await fetchEnhancedWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.trend).toBe('stable');
  });

  it('defaults to stable trend when only one observation', async () => {
    const metar = createMockMetarApiResponse({
      visib: 10,
      clouds: [],
    });
    vi.mocked(fetch).mockResolvedValueOnce(createMockFetchResponse([metar]));

    const result = await fetchEnhancedWeatherData('KLAX');
    expect(result).not.toBeNull();
    expect(result!.trend).toBe('stable');
  });
});

// ---------------------------------------------------------------------------
// analyzeWeatherVsAircraft (directly exported, pure logic)
// ---------------------------------------------------------------------------
describe('analyzeWeatherVsAircraft', () => {
  it('returns safe with no warnings for calm VFR weather', () => {
    const weather = createMockWeather({
      flightCategory: 'VFR',
      visibility: 10,
      wind: { direction: 270, speed: 8, gust: undefined },
      densityAltitude: 2000,
      hazards: [],
    });
    const aircraft = createMockAircraft();

    const result = analyzeWeatherVsAircraft(weather, aircraft);
    expect(result.safeToOperate).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.recommendations).toHaveLength(0);
  });

  it('warns about high winds with gusts > 20kt', () => {
    const weather = createMockWeather({
      wind: { direction: 270, speed: 18, gust: 22 },
      hazards: [],
    });
    const aircraft = createMockAircraft();

    const result = analyzeWeatherVsAircraft(weather, aircraft);
    expect(result.safeToOperate).toBe(true); // still safe below 25
    expect(result.warnings.some(w => w.includes('High winds'))).toBe(true);
  });

  it('marks unsafe when gusts exceed 25kt', () => {
    const weather = createMockWeather({
      wind: { direction: 270, speed: 20, gust: 28 },
      hazards: [],
    });
    const aircraft = createMockAircraft();

    const result = analyzeWeatherVsAircraft(weather, aircraft);
    expect(result.safeToOperate).toBe(false);
    expect(result.warnings.some(w => w.includes('High winds'))).toBe(true);
  });

  it('warns about high density altitude > 7000ft', () => {
    const weather = createMockWeather({
      densityAltitude: 7500,
      wind: { direction: 270, speed: 5 },
      hazards: [],
    });
    const aircraft = createMockAircraft();

    const result = analyzeWeatherVsAircraft(weather, aircraft);
    expect(result.safeToOperate).toBe(true); // still safe below 9000
    expect(result.warnings.some(w => w.includes('High density altitude'))).toBe(true);
    expect(result.recommendations.some(r => r.includes('Reduce payload'))).toBe(true);
  });

  it('marks unsafe when density altitude exceeds 9000ft', () => {
    const weather = createMockWeather({
      densityAltitude: 9500,
      wind: { direction: 270, speed: 5 },
      hazards: [],
    });
    const aircraft = createMockAircraft();

    const result = analyzeWeatherVsAircraft(weather, aircraft);
    expect(result.safeToOperate).toBe(false);
    expect(result.warnings.some(w => w.includes('CRITICAL'))).toBe(true);
  });

  it('recommends Va speed reduction in turbulence with known Va', () => {
    const weather = createMockWeather({
      wind: { direction: 270, speed: 10 },
      hazards: [
        {
          type: 'AIRMET',
          description: 'Moderate turbulence below 12000ft',
          severity: 'medium',
        },
      ],
    });
    const aircraft = createMockAircraft({
      operatingLimits: { vSpeeds: { va: 99 } },
    });

    const result = analyzeWeatherVsAircraft(weather, aircraft);
    expect(result.recommendations.some(r => r.includes('99'))).toBe(true);
    expect(result.recommendations.some(r => r.includes('Va'))).toBe(true);
  });

  it('recommends generic Va speed reduction in turbulence without known Va', () => {
    const weather = createMockWeather({
      wind: { direction: 270, speed: 10 },
      hazards: [
        {
          type: 'AIRMET',
          description: 'Moderate turbulence expected',
          severity: 'medium',
        },
      ],
    });
    const aircraft = createMockAircraft({
      operatingLimits: {},
    });

    const result = analyzeWeatherVsAircraft(weather, aircraft);
    expect(result.recommendations.some(r => r.includes('maneuvering speed'))).toBe(true);
  });

  it('marks unsafe for extreme hazards (thunderstorms)', () => {
    const weather = createMockWeather({
      wind: { direction: 270, speed: 10 },
      hazards: [
        {
          type: 'CONVECTIVE',
          description: 'Thunderstorm activity reported',
          severity: 'extreme',
        },
      ],
    });
    const aircraft = createMockAircraft();

    const result = analyzeWeatherVsAircraft(weather, aircraft);
    expect(result.safeToOperate).toBe(false);
    expect(result.warnings.some(w => w.includes('CRITICAL'))).toBe(true);
  });

  it('warns for high severity hazards but stays safe', () => {
    const weather = createMockWeather({
      wind: { direction: 270, speed: 10 },
      hazards: [
        {
          type: 'AIRMET',
          description: 'Freezing precipitation',
          severity: 'high',
        },
      ],
    });
    const aircraft = createMockAircraft();

    const result = analyzeWeatherVsAircraft(weather, aircraft);
    expect(result.safeToOperate).toBe(true);
    expect(result.warnings.some(w => w.includes('WARNING'))).toBe(true);
  });

  it('handles missing wind data gracefully', () => {
    const weather = createMockWeather({
      wind: undefined as unknown as IEnhancedWeatherData['wind'],
      hazards: [],
    });
    const aircraft = createMockAircraft();

    const result = analyzeWeatherVsAircraft(weather, aircraft);
    expect(result.safeToOperate).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('handles missing density altitude gracefully', () => {
    const weather = createMockWeather({
      densityAltitude: undefined,
      wind: { direction: 270, speed: 5 },
      hazards: [],
    });
    const aircraft = createMockAircraft();

    const result = analyzeWeatherVsAircraft(weather, aircraft);
    expect(result.safeToOperate).toBe(true);
    // Should NOT warn about density altitude when undefined
    expect(result.warnings.some(w => w.includes('density altitude'))).toBe(false);
  });

  it('handles missing hazards array gracefully', () => {
    const weather = createMockWeather({
      wind: { direction: 270, speed: 5 },
      hazards: undefined,
    });
    const aircraft = createMockAircraft();

    const result = analyzeWeatherVsAircraft(weather, aircraft);
    expect(result.safeToOperate).toBe(true);
  });

  it('uses gust speed when no steady wind but high gusts', () => {
    const weather = createMockWeather({
      wind: { direction: 270, speed: 10, gust: 30 },
      hazards: [],
    });
    const aircraft = createMockAircraft();

    const result = analyzeWeatherVsAircraft(weather, aircraft);
    expect(result.safeToOperate).toBe(false); // gust 30 > 25
    expect(result.warnings.some(w => w.includes('gusting 30'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// analyzeWeatherVsPilot (directly exported, pure logic)
// ---------------------------------------------------------------------------
describe('analyzeWeatherVsPilot', () => {
  it('returns legal and safe for VFR weather with experienced instrument-rated pilot', () => {
    const weather = createMockWeather({ flightCategory: 'VFR' });
    const pilot = createMockPilot({
      certificates: { instrumentRated: true, type: 'Private' },
      experience: { totalHours: 500, nightHours: 50, ifrHours: 100 },
    });

    const result = analyzeWeatherVsPilot(weather, pilot);
    expect(result.legal).toBe(true);
    expect(result.safeRecommendation).toBe(true);
  });

  it('flags IFR conditions as illegal for VFR-only pilot', () => {
    const weather = createMockWeather({ flightCategory: 'IFR' });
    const pilot = createMockPilot({
      certificates: { instrumentRated: false, type: 'Private' },
    });

    const result = analyzeWeatherVsPilot(weather, pilot);
    expect(result.legal).toBe(false);
    expect(result.safeRecommendation).toBe(false);
    expect(result.warnings.some(w => w.includes('instrument rating'))).toBe(true);
  });

  it('flags LIFR conditions as illegal for VFR-only pilot', () => {
    const weather = createMockWeather({ flightCategory: 'LIFR' });
    const pilot = createMockPilot({
      certificates: { instrumentRated: false, type: 'Private' },
    });

    const result = analyzeWeatherVsPilot(weather, pilot);
    expect(result.legal).toBe(false);
    expect(result.safeRecommendation).toBe(false);
    expect(result.warnings.some(w => w.includes('LIFR'))).toBe(true);
  });

  it('warns low-IFR-experience pilot in IFR conditions (legal but not safe)', () => {
    const weather = createMockWeather({ flightCategory: 'IFR' });
    const pilot = createMockPilot({
      certificates: { instrumentRated: true, type: 'Private' },
      experience: { totalHours: 200, ifrHours: 30 },
    });

    const result = analyzeWeatherVsPilot(weather, pilot);
    expect(result.legal).toBe(true);
    expect(result.safeRecommendation).toBe(false);
    expect(result.warnings.some(w => w.includes('Low IFR experience'))).toBe(true);
    expect(result.recommendations.some(r => r.includes('CFII'))).toBe(true);
  });

  it('flags MVFR conditions as illegal for student pilots', () => {
    const weather = createMockWeather({ flightCategory: 'MVFR' });
    const pilot = createMockPilot({
      certificates: { instrumentRated: false, type: 'Student' },
      experience: { totalHours: 30 },
    });

    const result = analyzeWeatherVsPilot(weather, pilot);
    expect(result.legal).toBe(false);
    expect(result.warnings.some(w => w.includes('Student pilots'))).toBe(true);
  });

  it('warns low-time pilot in MVFR conditions', () => {
    const weather = createMockWeather({ flightCategory: 'MVFR' });
    const pilot = createMockPilot({
      certificates: { instrumentRated: false, type: 'Private' },
      experience: { totalHours: 60 },
    });

    const result = analyzeWeatherVsPilot(weather, pilot);
    expect(result.legal).toBe(true); // Not student, so legal
    expect(result.safeRecommendation).toBe(false);
    expect(result.warnings.some(w => w.includes('MVFR conditions challenging'))).toBe(true);
  });

  it('does not warn about MVFR for pilot with 100+ hours', () => {
    const weather = createMockWeather({ flightCategory: 'MVFR' });
    const pilot = createMockPilot({
      certificates: { instrumentRated: false, type: 'Private' },
      experience: { totalHours: 150, nightHours: 50 },
    });

    const result = analyzeWeatherVsPilot(weather, pilot);
    expect(result.legal).toBe(true);
    expect(result.safeRecommendation).toBe(true);
    expect(result.warnings.some(w => w.includes('MVFR'))).toBe(false);
  });

  it('warns low-time pilot about strong winds >= 20kt', () => {
    const weather = createMockWeather({
      flightCategory: 'VFR',
      wind: { direction: 270, speed: 22, gust: undefined },
    });
    const pilot = createMockPilot({
      certificates: { instrumentRated: false, type: 'Private' },
      experience: { totalHours: 40 },
    });

    const result = analyzeWeatherVsPilot(weather, pilot);
    expect(result.safeRecommendation).toBe(false);
    expect(result.warnings.some(w => w.includes('Strong winds'))).toBe(true);
  });

  it('warns about excessive winds >= 30kt for any pilot', () => {
    const weather = createMockWeather({
      flightCategory: 'VFR',
      wind: { direction: 270, speed: 32, gust: undefined },
    });
    const pilot = createMockPilot({
      certificates: { instrumentRated: true, type: 'Private' },
      experience: { totalHours: 500 },
    });

    const result = analyzeWeatherVsPilot(weather, pilot);
    expect(result.safeRecommendation).toBe(false);
    expect(result.warnings.some(w => w.includes('Excessive winds'))).toBe(true);
  });

  it('considers gust speed in wind checks (gust >= 20kt triggers warning)', () => {
    const weather = createMockWeather({
      flightCategory: 'VFR',
      wind: { direction: 270, speed: 12, gust: 24 },
    });
    const pilot = createMockPilot({
      certificates: { instrumentRated: false, type: 'Private' },
      experience: { totalHours: 40 },
    });

    const result = analyzeWeatherVsPilot(weather, pilot);
    expect(result.safeRecommendation).toBe(false);
    expect(result.warnings.some(w => w.includes('24'))).toBe(true);
  });

  it('warns about high density altitude for low-time pilot', () => {
    const weather = createMockWeather({
      flightCategory: 'VFR',
      densityAltitude: 6000,
      wind: { direction: 270, speed: 5 },
    });
    const pilot = createMockPilot({
      experience: { totalHours: 60 },
    });

    const result = analyzeWeatherVsPilot(weather, pilot);
    expect(result.warnings.some(w => w.includes('density altitude'))).toBe(true);
    expect(result.recommendations.some(r => r.includes('high altitude'))).toBe(true);
  });

  it('does not warn about density altitude for experienced pilot', () => {
    const weather = createMockWeather({
      flightCategory: 'VFR',
      densityAltitude: 6000,
      wind: { direction: 270, speed: 5 },
    });
    const pilot = createMockPilot({
      experience: { totalHours: 500 },
    });

    const result = analyzeWeatherVsPilot(weather, pilot);
    expect(result.warnings.some(w => w.includes('density altitude'))).toBe(false);
  });

  it('does not warn about density altitude when below 5000ft', () => {
    const weather = createMockWeather({
      flightCategory: 'VFR',
      densityAltitude: 3000,
      wind: { direction: 270, speed: 5 },
    });
    const pilot = createMockPilot({
      experience: { totalHours: 40 },
    });

    const result = analyzeWeatherVsPilot(weather, pilot);
    expect(result.warnings.some(w => w.includes('density altitude'))).toBe(false);
  });

  it('handles missing wind data gracefully', () => {
    const weather = createMockWeather({
      flightCategory: 'VFR',
      wind: undefined as unknown as IEnhancedWeatherData['wind'],
    });
    const pilot = createMockPilot();

    const result = analyzeWeatherVsPilot(weather, pilot);
    expect(result.legal).toBe(true);
    expect(result.safeRecommendation).toBe(true);
  });

  it('handles missing experience fields gracefully', () => {
    const weather = createMockWeather({ flightCategory: 'IFR' });
    const pilot = createMockPilot({
      certificates: { instrumentRated: true, type: 'Private' },
      experience: {},
    });

    const result = analyzeWeatherVsPilot(weather, pilot);
    // totalHours defaults to 0, ifrHours defaults to 0
    // ifrHours(0) < 50 => safeRecommendation = false
    expect(result.safeRecommendation).toBe(false);
    expect(result.warnings.some(w => w.includes('Low IFR experience'))).toBe(true);
  });

  // Night flight tests - these depend on the current time (Date.getHours())
  // so we mock Date to control night/day behavior
  describe('night flight checks', () => {
    it('flags student pilot night flight without endorsement at night', () => {
      // Mock the current time to be nighttime (22:00)
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-09T22:00:00'));

      const weather = createMockWeather({ flightCategory: 'VFR' });
      const pilot = createMockPilot({
        certificates: { instrumentRated: false, type: 'Student' },
        experience: { totalHours: 30, nightHours: 2 },
        endorsements: [],
      });

      const result = analyzeWeatherVsPilot(weather, pilot);
      expect(result.legal).toBe(false);
      expect(result.warnings.some(w => w.includes('Student pilot night flight'))).toBe(true);

      vi.useRealTimers();
    });

    it('allows student night flight with Night endorsement', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-09T22:00:00'));

      const weather = createMockWeather({ flightCategory: 'VFR' });
      const pilot = createMockPilot({
        certificates: { instrumentRated: false, type: 'Student' },
        experience: { totalHours: 30, nightHours: 5 },
        endorsements: [{ type: 'Night' }],
      });

      const result = analyzeWeatherVsPilot(weather, pilot);
      // With Night endorsement, the student pilot check passes
      expect(result.warnings.some(w => w.includes('Student pilot night flight'))).toBe(false);

      vi.useRealTimers();
    });

    it('warns about low night hours combined with non-VFR conditions at night', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-09T22:00:00'));

      const weather = createMockWeather({ flightCategory: 'MVFR' });
      const pilot = createMockPilot({
        certificates: { instrumentRated: true, type: 'Private' },
        experience: { totalHours: 200, nightHours: 10, ifrHours: 100 },
      });

      const result = analyzeWeatherVsPilot(weather, pilot);
      expect(result.safeRecommendation).toBe(false);
      expect(result.warnings.some(w => w.includes('Limited night experience'))).toBe(true);

      vi.useRealTimers();
    });

    it('does not flag night issues during daytime hours', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-09T14:00:00')); // 2 PM

      const weather = createMockWeather({ flightCategory: 'MVFR' });
      const pilot = createMockPilot({
        certificates: { instrumentRated: false, type: 'Student' },
        experience: { totalHours: 30, nightHours: 0 },
        endorsements: [],
      });

      const result = analyzeWeatherVsPilot(weather, pilot);
      // Daytime - night checks should not trigger
      expect(result.warnings.some(w => w.includes('night'))).toBe(false);

      vi.useRealTimers();
    });

    it('does not warn about night experience when nightHours >= 20', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-09T22:00:00'));

      const weather = createMockWeather({ flightCategory: 'MVFR' });
      const pilot = createMockPilot({
        certificates: { instrumentRated: true, type: 'Private' },
        experience: { totalHours: 300, nightHours: 25, ifrHours: 100 },
      });

      const result = analyzeWeatherVsPilot(weather, pilot);
      expect(result.warnings.some(w => w.includes('Limited night experience'))).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('combined scenarios', () => {
    it('IFR weather + VFR-only pilot = critical (illegal, unsafe)', () => {
      const weather = createMockWeather({
        flightCategory: 'IFR',
        visibility: 2,
        ceiling: 800,
      });
      const pilot = createMockPilot({
        certificates: { instrumentRated: false, type: 'Private' },
        experience: { totalHours: 200 },
      });

      const result = analyzeWeatherVsPilot(weather, pilot);
      expect(result.legal).toBe(false);
      expect(result.safeRecommendation).toBe(false);
    });

    it('good VFR weather + experienced pilot = no issues', () => {
      const weather = createMockWeather({
        flightCategory: 'VFR',
        visibility: 10,
        wind: { direction: 270, speed: 8 },
        densityAltitude: 2000,
      });
      const pilot = createMockPilot({
        certificates: { instrumentRated: true, type: 'Private' },
        experience: { totalHours: 1000, nightHours: 100, ifrHours: 200 },
      });

      const result = analyzeWeatherVsPilot(weather, pilot);
      expect(result.legal).toBe(true);
      expect(result.safeRecommendation).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.recommendations).toHaveLength(0);
    });

    it('MVFR + strong wind + low-time pilot = multiple warnings', () => {
      const weather = createMockWeather({
        flightCategory: 'MVFR',
        wind: { direction: 270, speed: 22 },
        densityAltitude: 6000,
      });
      const pilot = createMockPilot({
        certificates: { instrumentRated: false, type: 'Private' },
        experience: { totalHours: 40, nightHours: 2, ifrHours: 0 },
      });

      const result = analyzeWeatherVsPilot(weather, pilot);
      expect(result.safeRecommendation).toBe(false);
      // Should have MVFR warning, wind warning, and density altitude warning
      expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    });

    it('IFR weather + instrument-rated experienced pilot = legal and safe', () => {
      const weather = createMockWeather({
        flightCategory: 'IFR',
        visibility: 2,
        ceiling: 800,
        wind: { direction: 180, speed: 10 },
      });
      const pilot = createMockPilot({
        certificates: { instrumentRated: true, type: 'Private' },
        experience: { totalHours: 800, nightHours: 80, ifrHours: 150 },
      });

      const result = analyzeWeatherVsPilot(weather, pilot);
      expect(result.legal).toBe(true);
      expect(result.safeRecommendation).toBe(true);
    });
  });
});
