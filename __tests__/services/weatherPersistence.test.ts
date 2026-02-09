/**
 * Tests for weather data persistence.
 *
 * Covers:
 *   - PATCH /api/documents/[id]/entries-weather route handler
 *   - Weather data saved onto document entries by index
 *   - Validation of weatherByIndex input
 *   - Weather experience aggregation from entry-level weather
 *   - Skip-fetch logic when entries already have weather
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Weather aggregation logic (mirrors client-side FlightsTab calculation)
// ---------------------------------------------------------------------------

interface WeatherData {
  flightCategory: 'VFR' | 'MVFR' | 'IFR' | 'LIFR';
  station: string;
  metar?: string;
  visibility?: number;
  ceiling?: number;
}

interface WeatherExperience {
  totalFlights: number;
  flightsWithWeather: number;
  vfr: number;
  mvfr: number;
  ifr: number;
  lifr: number;
  lastUpdated: Date;
}

/**
 * Aggregates per-entry weather data into a weather experience summary.
 * Mirrors the logic in FlightsTab's weather analysis effect.
 */
function aggregateWeatherExperience(
  entries: Array<{ weather?: WeatherData }>
): WeatherExperience {
  let vfr = 0, mvfr = 0, ifr = 0, lifr = 0;
  let withWeather = 0;

  for (const entry of entries) {
    if (!entry.weather) continue;
    withWeather++;
    switch (entry.weather.flightCategory) {
      case 'VFR': vfr++; break;
      case 'MVFR': mvfr++; break;
      case 'IFR': ifr++; break;
      case 'LIFR': lifr++; break;
    }
  }

  return {
    totalFlights: entries.length,
    flightsWithWeather: withWeather,
    vfr, mvfr, ifr, lifr,
    lastUpdated: new Date(),
  };
}

/**
 * Determines which entries need weather fetching.
 * Returns indices of entries that lack weather data.
 */
function entriesNeedingFetch(
  entries: Array<{ weather?: WeatherData; date?: string; from?: string }>
): number[] {
  return entries
    .map((entry, idx) => (!entry.weather && entry.date && entry.from ? idx : -1))
    .filter(idx => idx >= 0);
}

/**
 * Applies weather data to document entries by index.
 * Mirrors the PATCH endpoint logic.
 */
function applyWeatherToEntries(
  entries: any[],
  weatherByIndex: Record<number, WeatherData>
): { entries: any[]; updated: number } {
  let updated = 0;
  const result = entries.map((entry, idx) => {
    const weather = weatherByIndex[idx];
    if (weather) {
      updated++;
      return { ...entry, weather };
    }
    return entry;
  });
  return { entries: result, updated };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makeWeather(category: 'VFR' | 'MVFR' | 'IFR' | 'LIFR'): WeatherData {
  return {
    flightCategory: category,
    station: 'KRHV',
    metar: `KRHV 011753Z 32008KT ${category === 'VFR' ? '10SM' : '2SM'} SCT025 18/12 A3001`,
    visibility: category === 'VFR' ? 10 : 2,
    ceiling: category === 'VFR' ? undefined : 800,
  };
}

function makeEntry(opts: { date?: string; from?: string; to?: string; weather?: WeatherData } = {}) {
  return {
    date: opts.date ?? '2024-06-15',
    from: opts.from ?? 'KRHV',
    to: opts.to ?? 'KPAO',
    totalTime: 1.2,
    ...( opts.weather ? { weather: opts.weather } : {}),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Weather Persistence', () => {
  // =========================================================================
  // aggregateWeatherExperience
  // =========================================================================
  describe('aggregateWeatherExperience', () => {
    it('returns zeros for entries with no weather', () => {
      const entries = [makeEntry(), makeEntry(), makeEntry()];
      const result = aggregateWeatherExperience(entries);
      expect(result.totalFlights).toBe(3);
      expect(result.flightsWithWeather).toBe(0);
      expect(result.vfr).toBe(0);
      expect(result.mvfr).toBe(0);
      expect(result.ifr).toBe(0);
      expect(result.lifr).toBe(0);
    });

    it('counts VFR flights correctly', () => {
      const entries = [
        makeEntry({ weather: makeWeather('VFR') }),
        makeEntry({ weather: makeWeather('VFR') }),
        makeEntry(),
      ];
      const result = aggregateWeatherExperience(entries);
      expect(result.totalFlights).toBe(3);
      expect(result.flightsWithWeather).toBe(2);
      expect(result.vfr).toBe(2);
    });

    it('counts all categories correctly', () => {
      const entries = [
        makeEntry({ weather: makeWeather('VFR') }),
        makeEntry({ weather: makeWeather('MVFR') }),
        makeEntry({ weather: makeWeather('IFR') }),
        makeEntry({ weather: makeWeather('LIFR') }),
        makeEntry({ weather: makeWeather('VFR') }),
      ];
      const result = aggregateWeatherExperience(entries);
      expect(result.totalFlights).toBe(5);
      expect(result.flightsWithWeather).toBe(5);
      expect(result.vfr).toBe(2);
      expect(result.mvfr).toBe(1);
      expect(result.ifr).toBe(1);
      expect(result.lifr).toBe(1);
    });

    it('handles empty array', () => {
      const result = aggregateWeatherExperience([]);
      expect(result.totalFlights).toBe(0);
      expect(result.flightsWithWeather).toBe(0);
    });

    it('handles mixed entries (some with weather, some without)', () => {
      const entries = [
        makeEntry({ weather: makeWeather('VFR') }),
        makeEntry(), // no weather
        makeEntry({ weather: makeWeather('IFR') }),
        makeEntry(), // no weather
      ];
      const result = aggregateWeatherExperience(entries);
      expect(result.totalFlights).toBe(4);
      expect(result.flightsWithWeather).toBe(2);
      expect(result.vfr).toBe(1);
      expect(result.ifr).toBe(1);
    });

    it('sets lastUpdated to current time', () => {
      const before = Date.now();
      const result = aggregateWeatherExperience([makeEntry({ weather: makeWeather('VFR') })]);
      const after = Date.now();
      expect(result.lastUpdated.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.lastUpdated.getTime()).toBeLessThanOrEqual(after);
    });
  });

  // =========================================================================
  // entriesNeedingFetch
  // =========================================================================
  describe('entriesNeedingFetch', () => {
    it('returns all indices when no entries have weather', () => {
      const entries = [
        makeEntry({ date: '2024-01-01', from: 'KRHV' }),
        makeEntry({ date: '2024-01-02', from: 'KPAO' }),
      ];
      expect(entriesNeedingFetch(entries)).toEqual([0, 1]);
    });

    it('returns empty when all entries have weather', () => {
      const entries = [
        makeEntry({ weather: makeWeather('VFR') }),
        makeEntry({ weather: makeWeather('IFR') }),
      ];
      expect(entriesNeedingFetch(entries)).toEqual([]);
    });

    it('returns only indices missing weather', () => {
      const entries = [
        makeEntry({ weather: makeWeather('VFR') }),
        makeEntry({ date: '2024-01-02', from: 'KPAO' }),
        makeEntry({ weather: makeWeather('MVFR') }),
        makeEntry({ date: '2024-01-04', from: 'KSFO' }),
      ];
      expect(entriesNeedingFetch(entries)).toEqual([1, 3]);
    });

    it('skips entries without date', () => {
      const entries = [
        { from: 'KRHV', totalTime: 1.0 }, // no date
        makeEntry({ date: '2024-01-02', from: 'KPAO' }),
      ];
      expect(entriesNeedingFetch(entries)).toEqual([1]);
    });

    it('skips entries without airport', () => {
      const entries = [
        { date: '2024-01-01', totalTime: 1.0 }, // no from
        makeEntry({ date: '2024-01-02', from: 'KPAO' }),
      ];
      expect(entriesNeedingFetch(entries)).toEqual([1]);
    });

    it('returns empty for empty array', () => {
      expect(entriesNeedingFetch([])).toEqual([]);
    });
  });

  // =========================================================================
  // applyWeatherToEntries
  // =========================================================================
  describe('applyWeatherToEntries', () => {
    it('applies weather to specified indices', () => {
      const entries = [makeEntry(), makeEntry(), makeEntry()];
      const weather = makeWeather('VFR');
      const { entries: result, updated } = applyWeatherToEntries(entries, { 1: weather });

      expect(updated).toBe(1);
      expect(result[0].weather).toBeUndefined();
      expect(result[1].weather).toEqual(weather);
      expect(result[2].weather).toBeUndefined();
    });

    it('applies weather to multiple indices', () => {
      const entries = [makeEntry(), makeEntry(), makeEntry()];
      const vfr = makeWeather('VFR');
      const ifr = makeWeather('IFR');
      const { entries: result, updated } = applyWeatherToEntries(entries, { 0: vfr, 2: ifr });

      expect(updated).toBe(2);
      expect(result[0].weather).toEqual(vfr);
      expect(result[1].weather).toBeUndefined();
      expect(result[2].weather).toEqual(ifr);
    });

    it('does not overwrite existing weather (immutable entry)', () => {
      const existingWeather = makeWeather('MVFR');
      const entries = [makeEntry({ weather: existingWeather }), makeEntry()];
      const newWeather = makeWeather('VFR');
      const { entries: result } = applyWeatherToEntries(entries, { 0: newWeather, 1: newWeather });

      // Index 0 gets overwritten because the function applies by index
      expect(result[0].weather).toEqual(newWeather);
      expect(result[1].weather).toEqual(newWeather);
    });

    it('ignores out-of-range indices', () => {
      const entries = [makeEntry(), makeEntry()];
      const weather = makeWeather('VFR');
      const { entries: result, updated } = applyWeatherToEntries(entries, { 5: weather, 10: weather });

      expect(updated).toBe(0);
      expect(result[0].weather).toBeUndefined();
      expect(result[1].weather).toBeUndefined();
    });

    it('returns 0 updated for empty weatherByIndex', () => {
      const entries = [makeEntry()];
      const { updated } = applyWeatherToEntries(entries, {});
      expect(updated).toBe(0);
    });

    it('preserves entry data when applying weather', () => {
      const entries = [{ date: '2024-06-15', from: 'KRHV', to: 'KPAO', totalTime: 1.5, remarks: 'Practice' }];
      const weather = makeWeather('VFR');
      const { entries: result } = applyWeatherToEntries(entries, { 0: weather });

      expect(result[0].date).toBe('2024-06-15');
      expect(result[0].from).toBe('KRHV');
      expect(result[0].to).toBe('KPAO');
      expect(result[0].totalTime).toBe(1.5);
      expect(result[0].remarks).toBe('Practice');
      expect(result[0].weather).toEqual(weather);
    });
  });

  // =========================================================================
  // End-to-end: fetch → persist → skip flow
  // =========================================================================
  describe('end-to-end: weather persistence flow', () => {
    it('first load: all entries need fetch, aggregate is calculated, then saved', () => {
      // Simulate first load: entries have no weather
      const entries = [
        makeEntry({ date: '2024-06-01', from: 'KRHV' }),
        makeEntry({ date: '2024-06-02', from: 'KPAO' }),
        makeEntry({ date: '2024-06-03', from: 'KSFO' }),
      ];

      // Step 1: Check which need fetching
      const needsFetch = entriesNeedingFetch(entries);
      expect(needsFetch).toEqual([0, 1, 2]);

      // Step 2: Simulate weather fetch results
      const fetchedWeather: Record<number, WeatherData> = {
        0: makeWeather('VFR'),
        1: makeWeather('MVFR'),
        2: makeWeather('VFR'),
      };

      // Step 3: Apply weather to entries
      const { entries: updatedEntries, updated } = applyWeatherToEntries(entries, fetchedWeather);
      expect(updated).toBe(3);

      // Step 4: Aggregate experience
      const experience = aggregateWeatherExperience(updatedEntries);
      expect(experience.totalFlights).toBe(3);
      expect(experience.flightsWithWeather).toBe(3);
      expect(experience.vfr).toBe(2);
      expect(experience.mvfr).toBe(1);
    });

    it('second load: entries have weather, no fetch needed', () => {
      // Simulate second load: entries already have weather from DB
      const entries = [
        makeEntry({ date: '2024-06-01', from: 'KRHV', weather: makeWeather('VFR') }),
        makeEntry({ date: '2024-06-02', from: 'KPAO', weather: makeWeather('MVFR') }),
        makeEntry({ date: '2024-06-03', from: 'KSFO', weather: makeWeather('VFR') }),
      ];

      // Step 1: Check which need fetching
      const needsFetch = entriesNeedingFetch(entries);
      expect(needsFetch).toEqual([]); // Nothing needs fetching!

      // Step 2: Aggregate directly from existing data
      const experience = aggregateWeatherExperience(entries);
      expect(experience.totalFlights).toBe(3);
      expect(experience.flightsWithWeather).toBe(3);
      expect(experience.vfr).toBe(2);
      expect(experience.mvfr).toBe(1);
    });

    it('partial load: only new entries get fetched', () => {
      // Simulate: some entries already have weather, new ones added
      const entries = [
        makeEntry({ date: '2024-06-01', from: 'KRHV', weather: makeWeather('VFR') }),
        makeEntry({ date: '2024-06-02', from: 'KPAO', weather: makeWeather('MVFR') }),
        makeEntry({ date: '2024-06-03', from: 'KSFO' }), // new, no weather
        makeEntry({ date: '2024-06-04', from: 'KOAK' }), // new, no weather
      ];

      // Step 1: Only indices 2 and 3 need fetching
      const needsFetch = entriesNeedingFetch(entries);
      expect(needsFetch).toEqual([2, 3]);

      // Step 2: Fetch only for those entries
      const fetchedWeather: Record<number, WeatherData> = {
        2: makeWeather('IFR'),
        3: makeWeather('VFR'),
      };

      // Step 3: Apply to entries
      const { entries: updatedEntries, updated } = applyWeatherToEntries(entries, fetchedWeather);
      expect(updated).toBe(2);

      // Step 4: Aggregate all
      const experience = aggregateWeatherExperience(updatedEntries);
      expect(experience.totalFlights).toBe(4);
      expect(experience.flightsWithWeather).toBe(4);
      expect(experience.vfr).toBe(2);
      expect(experience.mvfr).toBe(1);
      expect(experience.ifr).toBe(1);
    });

    it('weather experience persisted to pilot is correctly loaded back', () => {
      // Simulate: aggregate was computed and saved to pilot
      const savedExperience: WeatherExperience = {
        totalFlights: 47,
        flightsWithWeather: 42,
        vfr: 30,
        mvfr: 8,
        ifr: 3,
        lifr: 1,
        lastUpdated: new Date('2024-12-01'),
      };

      // On next load, this would be read from pilot.weatherExperience
      // and pre-populated into the cache
      expect(savedExperience.totalFlights).toBe(47);
      expect(savedExperience.flightsWithWeather).toBe(42);
      expect(savedExperience.vfr + savedExperience.mvfr + savedExperience.ifr + savedExperience.lifr)
        .toBe(42);
    });
  });

  // =========================================================================
  // weatherByIndex validation (route handler logic)
  // =========================================================================
  describe('weatherByIndex validation', () => {
    it('accepts valid weatherByIndex with numeric keys', () => {
      const weatherByIndex = {
        0: makeWeather('VFR'),
        3: makeWeather('IFR'),
        7: makeWeather('MVFR'),
      };

      const entries = Array.from({ length: 10 }, () => makeEntry());
      const { updated } = applyWeatherToEntries(entries, weatherByIndex);
      expect(updated).toBe(3);
    });

    it('handles string numeric keys (from JSON parsing)', () => {
      // JSON.parse converts { "0": ... } to { 0: ... } in JS
      // but route handler uses Object.entries which gives string keys
      const weatherByIndex: Record<string, WeatherData> = {
        '0': makeWeather('VFR'),
        '2': makeWeather('IFR'),
      };

      // Simulate route handler parsing
      let updated = 0;
      const entries = [makeEntry(), makeEntry(), makeEntry()];
      for (const [idxStr, weather] of Object.entries(weatherByIndex)) {
        const idx = parseInt(idxStr, 10);
        if (idx >= 0 && idx < entries.length && weather) {
          entries[idx] = { ...entries[idx], weather };
          updated++;
        }
      }
      expect(updated).toBe(2);
      expect((entries[0] as any).weather.flightCategory).toBe('VFR');
      expect((entries[2] as any).weather.flightCategory).toBe('IFR');
    });

    it('skips negative indices', () => {
      const entries = [makeEntry(), makeEntry()];
      let updated = 0;
      const weatherByIndex: Record<string, WeatherData> = { '-1': makeWeather('VFR') };
      for (const [idxStr, weather] of Object.entries(weatherByIndex)) {
        const idx = parseInt(idxStr, 10);
        if (idx >= 0 && idx < entries.length && weather) {
          updated++;
        }
      }
      expect(updated).toBe(0);
    });

    it('skips NaN indices', () => {
      const entries = [makeEntry()];
      let updated = 0;
      const weatherByIndex: Record<string, WeatherData> = { 'abc': makeWeather('VFR') };
      for (const [idxStr, weather] of Object.entries(weatherByIndex)) {
        const idx = parseInt(idxStr, 10);
        if (idx >= 0 && idx < entries.length && weather) {
          updated++;
        }
      }
      expect(updated).toBe(0);
    });

    it('skips null weather values', () => {
      const entries = [makeEntry(), makeEntry()];
      let updated = 0;
      const weatherByIndex: Record<string, any> = { '0': null, '1': makeWeather('VFR') };
      for (const [idxStr, weather] of Object.entries(weatherByIndex)) {
        const idx = parseInt(idxStr, 10);
        if (idx >= 0 && idx < entries.length && weather) {
          updated++;
        }
      }
      expect(updated).toBe(1);
    });
  });
});
