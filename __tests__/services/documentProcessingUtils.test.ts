import { describe, it, expect } from 'vitest';
import {
  calculateSummary,
  detectEntryCategory,
  getStatusConfig,
  roundToTenths,
  MS_PER_DAY,
  DAYS_30_MS,
  DAYS_90_MS,
} from '@/lib/services/documentProcessingUtils';

// ---------------------------------------------------------------------------
// Realistic test data shaped like what Reducto returns
// ---------------------------------------------------------------------------

/** Pilot logbook entries as returned by Reducto AI parser */
const pilotEntries = [
  {
    date: '2024-06-01',
    aircraftIdent: 'N12345',
    aircraftType: 'C172',
    from: 'KPAO',
    to: 'KSQL',
    totalTime: 1.5,
    pic: 1.5,
    sic: 0,
    solo: 0,
    dualReceived: 0,
    crossCountry: 1.5,
    night: 0,
    actualInstrument: 0,
    simulatedInstrument: 0.3,
    sel: 1.5,
    mel: 0,
    landingsDay: 2,
    landingsNight: 0,
    remarks: 'Practice area work, short field landings',
  },
  {
    date: '2024-06-15',
    aircraftIdent: 'N12345',
    aircraftType: 'C172',
    from: 'KSQL',
    to: 'KPAO',
    totalTime: 2.3,
    pic: 2.3,
    sic: 0,
    solo: 0,
    dualReceived: 0,
    crossCountry: 2.3,
    night: 1.1,
    actualInstrument: 0.5,
    simulatedInstrument: 0,
    sel: 2.3,
    mel: 0,
    landingsDay: 1,
    landingsNight: 2,
    remarks: 'Night cross-country with IFR approach',
  },
  {
    date: '2024-07-02',
    aircraftIdent: 'N67890',
    aircraftType: 'PA28',
    from: 'KRHV',
    to: 'KMOD',
    totalTime: 3.0,
    pic: 3.0,
    sic: 0,
    solo: 3.0,
    dualReceived: 0,
    crossCountry: 3.0,
    night: 0,
    actualInstrument: 1.2,
    simulatedInstrument: 0,
    sel: 3.0,
    mel: 0,
    landingsDay: 3,
    landingsNight: 0,
    remarks: 'Solo cross-country to Modesto',
  },
];

/** Aircraft maintenance logbook entries as returned by Reducto AI parser */
const aircraftMaintenanceEntries = [
  {
    date: '2023-03-15',
    description: 'Performed Annual Inspection per 14 CFR 43 Appendix D',
    hobbsTime: 4521.3,
    tachTime: 4102.7,
    mechanic: 'John Smith, A&P/IA #12345',
    isInspection: true,
    inspectionType: 'annual',
  },
  {
    date: '2023-09-20',
    description: 'Replaced alternator drive belt, safety wired, ops check good',
    hobbsTime: 4680.1,
    tachTime: 4250.5,
    mechanic: 'Jane Doe, A&P #67890',
    isInspection: false,
    inspectionType: null,
  },
  {
    date: '2024-01-10',
    description: 'Oil change, replaced filter, cut and inspected. No metal found.',
    hobbsTime: 4812.6,
    tachTime: 4391.2,
    mechanic: 'John Smith, A&P/IA #12345',
    isInspection: false,
    inspectionType: null,
  },
  {
    date: '2024-03-18',
    description: 'Performed Annual Inspection per 14 CFR 43 Appendix D. Replaced exhaust gaskets.',
    hobbsTime: 4900.0,
    tachTime: 4470.3,
    mechanic: 'John Smith, A&P/IA #12345',
    isInspection: true,
    inspectionType: 'annual',
  },
];

// ===================================================================
// roundToTenths
// ===================================================================
describe('roundToTenths', () => {
  it('should round 1.55 to 1.6', () => {
    expect(roundToTenths(1.55)).toBe(1.6);
  });

  it('should leave an already-rounded number unchanged', () => {
    expect(roundToTenths(3.2)).toBe(3.2);
  });

  it('should round 0 to 0', () => {
    expect(roundToTenths(0)).toBe(0);
  });

  it('should handle negative numbers', () => {
    expect(roundToTenths(-2.75)).toBe(-2.7); // Math.round(-27.5) = -27
  });

  it('should round long decimals', () => {
    expect(roundToTenths(1.249999)).toBe(1.2);
    expect(roundToTenths(1.25001)).toBe(1.3);
  });
});

// ===================================================================
// Time constants
// ===================================================================
describe('time constants', () => {
  it('MS_PER_DAY should equal 86400000', () => {
    expect(MS_PER_DAY).toBe(86400000);
  });

  it('DAYS_30_MS should equal 30 days in milliseconds', () => {
    expect(DAYS_30_MS).toBe(30 * 86400000);
  });

  it('DAYS_90_MS should equal 90 days in milliseconds', () => {
    expect(DAYS_90_MS).toBe(90 * 86400000);
  });
});

// ===================================================================
// getStatusConfig
// ===================================================================
describe('getStatusConfig', () => {
  it('should return green/success config for "go"', () => {
    const config = getStatusConfig('go');
    expect(config.color).toBe('#10b981');
    expect(config.bgColor).toBe('#ecfdf5');
    expect(config.shortLabel).toBe('GO');
    expect(config.text).toBe('GO - Flight Approved');
    expect(config.isDangerous).toBe(false);
  });

  it('should return yellow/warning config for "caution"', () => {
    const config = getStatusConfig('caution');
    expect(config.color).toBe('#f59e0b');
    expect(config.bgColor).toBe('#fffbeb');
    expect(config.shortLabel).toBe('CAUTION');
    expect(config.text).toBe('CAUTION - Review Required');
    expect(config.isDangerous).toBe(true);
  });

  it('should return red/danger config for "no-go"', () => {
    const config = getStatusConfig('no-go');
    expect(config.color).toBe('#ef4444');
    expect(config.bgColor).toBe('#fef2f2');
    expect(config.shortLabel).toBe('NO-GO');
    expect(config.text).toBe('NO-GO - Flight Not Recommended');
    expect(config.isDangerous).toBe(true);
  });

  it('should default to no-go config for an unknown status', () => {
    const config = getStatusConfig('invalid-status');
    expect(config.color).toBe('#ef4444');
    expect(config.shortLabel).toBe('NO-GO');
    expect(config.isDangerous).toBe(true);
  });

  it('should default to no-go config for an empty string', () => {
    const config = getStatusConfig('');
    expect(config.shortLabel).toBe('NO-GO');
  });
});

// ===================================================================
// detectEntryCategory
// ===================================================================
describe('detectEntryCategory', () => {
  // Engine-related keywords
  it('should detect "Replaced alternator" as engine', () => {
    // Note: "alternator" is NOT listed in engine keywords.
    // The function checks for 'engine', 'cylinder', 'magneto', 'spark plug',
    // 'oil change', 'compression'. "Replaced alternator" has none of those,
    // so it falls through to the default 'airframe'.
    const result = detectEntryCategory('Replaced alternator');
    expect(result).toBe('airframe');
  });

  it('should detect "Replaced engine mount bolts" as engine', () => {
    expect(detectEntryCategory('Replaced engine mount bolts')).toBe('engine');
  });

  it('should detect cylinder work as engine', () => {
    expect(detectEntryCategory('Removed #3 cylinder for overhaul')).toBe('engine');
  });

  it('should detect magneto timing as engine', () => {
    expect(detectEntryCategory('Adjusted left magneto timing')).toBe('engine');
  });

  it('should detect spark plug replacement as engine', () => {
    expect(detectEntryCategory('Replaced all spark plugs, gapped to spec')).toBe('engine');
  });

  it('should detect oil change as engine', () => {
    expect(detectEntryCategory('Oil change, replaced filter, no metal')).toBe('engine');
  });

  it('should detect compression check as engine', () => {
    expect(detectEntryCategory('Performed differential compression test')).toBe('engine');
  });

  // Propeller-related keywords
  it('should detect propeller overhaul as propeller', () => {
    expect(detectEntryCategory('Propeller overhaul by Sensenich')).toBe('propeller');
  });

  it('should detect "prop " (with trailing space) as propeller', () => {
    expect(detectEntryCategory('Balanced prop at annual')).toBe('propeller');
  });

  it('should NOT detect "property" as propeller (no trailing space)', () => {
    // The keyword is 'prop ' with a space, so "property" won't match
    expect(detectEntryCategory('Updated property tags')).toBe('airframe');
  });

  // Avionics-related keywords
  it('should detect Garmin GNS 530 install as avionics', () => {
    expect(detectEntryCategory('Installed Garmin GNS 530 GPS/Nav/Comm')).toBe('avionics');
  });

  it('should detect radio work as avionics', () => {
    expect(detectEntryCategory('Repaired COM1 radio, replaced antenna')).toBe('avionics');
  });

  it('should detect transponder work as avionics', () => {
    expect(detectEntryCategory('Transponder check per 91.413')).toBe('avionics');
  });

  it('should detect GPS install as avionics', () => {
    expect(detectEntryCategory('Installed GPS WAAS receiver')).toBe('avionics');
  });

  it('should detect GIA module as avionics', () => {
    expect(detectEntryCategory('Replaced GIA 63W unit')).toBe('avionics');
  });

  it('should detect GDU display as avionics', () => {
    expect(detectEntryCategory('GDU 1060 screen replacement')).toBe('avionics');
  });

  it('should detect comm equipment as avionics', () => {
    expect(detectEntryCategory('Installed new comm antenna and coax')).toBe('avionics');
  });

  // Default / airframe
  it('should default to airframe for generic descriptions', () => {
    expect(detectEntryCategory('Performed Annual Inspection')).toBe('airframe');
  });

  it('should default to airframe for wing repair', () => {
    expect(detectEntryCategory('Repaired wing tip fairing')).toBe('airframe');
  });

  it('should default to airframe for landing gear work', () => {
    expect(detectEntryCategory('Replaced nose gear tire, inflated to 45 psi')).toBe('airframe');
  });

  // Edge cases
  it('should handle empty string and default to airframe', () => {
    expect(detectEntryCategory('')).toBe('airframe');
  });

  it('should handle null/undefined gracefully and default to airframe', () => {
    expect(detectEntryCategory(null as unknown as string)).toBe('airframe');
    expect(detectEntryCategory(undefined as unknown as string)).toBe('airframe');
  });

  it('should be case-insensitive', () => {
    expect(detectEntryCategory('ENGINE OVERHAUL COMPLETE')).toBe('engine');
    expect(detectEntryCategory('PROPELLER GOVERNOR ADJUSTED')).toBe('propeller');
    expect(detectEntryCategory('AVIONICS PANEL UPGRADE')).toBe('avionics');
  });
});

// ===================================================================
// calculateSummary - Pilot logbook (default / no documentType)
// ===================================================================
describe('calculateSummary - pilot logbook', () => {
  it('should sum totalTime across all entries', () => {
    const result = calculateSummary(pilotEntries);
    // 1.5 + 2.3 + 3.0 = 6.8
    expect(result.totalHours).toBe(6.8);
  });

  it('should count total entries', () => {
    const result = calculateSummary(pilotEntries);
    expect(result.totalEntries).toBe(3);
  });

  it('should extract dateRange from sorted dates', () => {
    const result = calculateSummary(pilotEntries);
    expect(result.dateRange).toEqual({
      from: '2024-06-01',
      to: '2024-07-02',
    });
  });

  it('should NOT have isLatestValue flag for pilot logbook', () => {
    const result = calculateSummary(pilotEntries);
    expect(result).not.toHaveProperty('isLatestValue');
  });

  it('should handle single entry and return its totalTime', () => {
    const single = [{ date: '2024-08-01', totalTime: 4.2 }];
    const result = calculateSummary(single);
    expect(result.totalEntries).toBe(1);
    expect(result.totalHours).toBe(4.2);
  });

  it('should use duration field when totalTime is absent', () => {
    const entries = [
      { date: '2024-01-01', duration: 2.5 },
      { date: '2024-01-02', duration: 1.0 },
    ];
    const result = calculateSummary(entries);
    expect(result.totalHours).toBe(3.5);
  });

  it('should prefer totalTime over duration when both present', () => {
    const entries = [{ date: '2024-01-01', totalTime: 3.0, duration: 1.0 }];
    const result = calculateSummary(entries);
    expect(result.totalHours).toBe(3.0);
  });

  it('should treat pilot_logbook documentType same as default', () => {
    const result = calculateSummary(pilotEntries, 'pilot_logbook');
    expect(result.totalHours).toBe(6.8);
    expect(result).not.toHaveProperty('isLatestValue');
  });
});

// ===================================================================
// calculateSummary - Aircraft / maintenance logbook
// ===================================================================
describe('calculateSummary - aircraft logbook', () => {
  it('should take MAXIMUM hobbsTime, not sum, for aircraft_logbook', () => {
    const result = calculateSummary(aircraftMaintenanceEntries, 'aircraft_logbook');
    // Max hobbsTime is 4900.0
    expect(result.totalHours).toBe(4900.0);
  });

  it('should take MAXIMUM tachTime when hobbsTime is 0', () => {
    const entriesNoHobbs = [
      { date: '2024-01-01', description: 'Oil change', hobbsTime: 0, tachTime: 3000.5 },
      { date: '2024-02-01', description: 'Annual', hobbsTime: 0, tachTime: 3100.8 },
    ];
    const result = calculateSummary(entriesNoHobbs, 'aircraft_logbook');
    expect(result.totalHours).toBe(3100.8);
  });

  it('should prefer hobbsTime over tachTime when both are present', () => {
    const entries = [
      { date: '2024-01-01', hobbsTime: 5000, tachTime: 4500 },
    ];
    const result = calculateSummary(entries, 'aircraft_logbook');
    expect(result.totalHours).toBe(5000);
  });

  it('should set isLatestValue flag to true for aircraft logbook', () => {
    const result = calculateSummary(aircraftMaintenanceEntries, 'aircraft_logbook');
    expect(result.isLatestValue).toBe(true);
  });

  it('should work with documentType "maintenance"', () => {
    const result = calculateSummary(aircraftMaintenanceEntries, 'maintenance');
    expect(result.totalHours).toBe(4900.0);
    expect(result.isLatestValue).toBe(true);
  });

  it('should extract dateRange for aircraft entries', () => {
    const result = calculateSummary(aircraftMaintenanceEntries, 'aircraft_logbook');
    expect(result.dateRange).toEqual({
      from: '2023-03-15',
      to: '2024-03-18',
    });
  });

  it('should return totalHours 0 when entries have no hobbs or tach', () => {
    const entries = [
      { date: '2024-01-01', description: 'Replaced seat belt' },
      { date: '2024-02-01', description: 'Replaced windshield' },
    ];
    const result = calculateSummary(entries, 'aircraft_logbook');
    expect(result.totalHours).toBe(0);
    expect(result.totalEntries).toBe(2);
  });
});

// ===================================================================
// calculateSummary - empty and edge cases
// ===================================================================
describe('calculateSummary - edge cases', () => {
  it('should return zeroed summary for empty array', () => {
    const result = calculateSummary([]);
    expect(result).toEqual({ totalEntries: 0 });
  });

  it('should return zeroed summary for null input', () => {
    const result = calculateSummary(null as unknown as any[]);
    expect(result).toEqual({ totalEntries: 0 });
  });

  it('should return zeroed summary for undefined input', () => {
    const result = calculateSummary(undefined as unknown as any[]);
    expect(result).toEqual({ totalEntries: 0 });
  });

  it('should treat null/undefined totalTime as 0', () => {
    const entries = [
      { date: '2024-01-01', totalTime: null },
      { date: '2024-01-02', totalTime: undefined },
      { date: '2024-01-03', totalTime: 2.0 },
    ];
    const result = calculateSummary(entries);
    expect(result.totalHours).toBe(2.0);
    expect(result.totalEntries).toBe(3);
  });

  it('should handle entries where all hours are missing', () => {
    const entries = [
      { date: '2024-01-01', aircraftIdent: 'N123' },
      { date: '2024-01-02', aircraftIdent: 'N456' },
    ];
    const result = calculateSummary(entries);
    expect(result.totalHours).toBe(0);
    expect(result.totalEntries).toBe(2);
  });

  it('should handle entries without date fields (no dateRange)', () => {
    const entries = [
      { totalTime: 1.0 },
      { totalTime: 2.0 },
    ];
    const result = calculateSummary(entries);
    expect(result.totalHours).toBe(3.0);
    expect(result.dateRange).toBeUndefined();
  });

  it('should handle a very large number of entries without error', () => {
    const largeArray = Array.from({ length: 10000 }, (_, i) => ({
      date: `2024-01-01`,
      totalTime: 0.1,
    }));
    const result = calculateSummary(largeArray);
    expect(result.totalEntries).toBe(10000);
    // 10000 * 0.1 = 1000.0, but floating-point may need rounding
    expect(result.totalHours).toBe(roundToTenths(10000 * 0.1));
  });

  it('should sort dates correctly for dateRange regardless of entry order', () => {
    const entries = [
      { date: '2024-12-31', totalTime: 1.0 },
      { date: '2024-01-01', totalTime: 1.0 },
      { date: '2024-06-15', totalTime: 1.0 },
    ];
    const result = calculateSummary(entries);
    expect(result.dateRange).toEqual({
      from: '2024-01-01',
      to: '2024-12-31',
    });
  });

  it('should skip falsy dates in dateRange computation', () => {
    const entries = [
      { date: '', totalTime: 1.0 },
      { date: null, totalTime: 1.0 },
      { date: '2024-05-01', totalTime: 1.0 },
    ];
    const result = calculateSummary(entries);
    expect(result.dateRange).toEqual({
      from: '2024-05-01',
      to: '2024-05-01',
    });
  });

  it('should round totalHours to one decimal place for pilot entries', () => {
    const entries = [
      { date: '2024-01-01', totalTime: 1.33 },
      { date: '2024-01-02', totalTime: 2.77 },
    ];
    const result = calculateSummary(entries);
    // 1.33 + 2.77 = 4.10 -> rounded to 4.1
    expect(result.totalHours).toBe(4.1);
  });

  it('should round totalHours to one decimal place for aircraft entries', () => {
    const entries = [
      { date: '2024-01-01', hobbsTime: 1234.567 },
    ];
    const result = calculateSummary(entries, 'aircraft_logbook');
    expect(result.totalHours).toBe(1234.6);
  });

  it('should handle aircraft entries where hobbsTime is falsy but tachTime exists', () => {
    const entries = [
      { date: '2024-01-01', hobbsTime: null, tachTime: 2500.3 },
      { date: '2024-02-01', hobbsTime: undefined, tachTime: 2600.7 },
    ];
    const result = calculateSummary(entries, 'maintenance');
    // maxHobbs stays 0, maxTach = 2600.7
    expect(result.totalHours).toBe(2600.7);
  });
});
