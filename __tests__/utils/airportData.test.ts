import { describe, it, expect } from 'vitest';
import {
  getAirportCoordinates,
  searchAirports,
  getAirportsInBounds,
  getApproximatePosition,
  airportDatabase,
} from '@/lib/airportData';

describe('getAirportCoordinates', () => {
  // --- Known airports ---
  it('returns coordinates for KLAX', () => {
    const result = getAirportCoordinates('KLAX');
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(33.9425, 2);
    expect(result!.lng).toBeCloseTo(-118.4081, 2);
    expect(result!.name).toBe('Los Angeles International');
  });

  it('returns coordinates for KJFK', () => {
    const result = getAirportCoordinates('KJFK');
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(40.6399, 2);
    expect(result!.lng).toBeCloseTo(-73.7787, 2);
    expect(result!.name).toBe('John F. Kennedy International');
    expect(result!.city).toBe('New York');
  });

  it('returns coordinates for KORD', () => {
    const result = getAirportCoordinates('KORD');
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(41.9742, 2);
    expect(result!.lng).toBeCloseTo(-87.9073, 2);
    expect(result!.name).toContain("O'Hare");
    expect(result!.city).toBe('Chicago');
  });

  // --- Unknown airports ---
  it('returns null for an unknown airport code', () => {
    expect(getAirportCoordinates('KZZZ')).toBeNull();
    expect(getAirportCoordinates('XXXX')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(getAirportCoordinates('')).toBeNull();
  });

  // --- Code normalization ---
  it('normalizes code to uppercase', () => {
    const result = getAirportCoordinates('klax');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Los Angeles International');
  });

  it('trims whitespace from code', () => {
    const result = getAirportCoordinates('  KLAX  ');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Los Angeles International');
  });

  it('handles 3-letter codes by trying K prefix', () => {
    // "LAX" should resolve to KLAX
    const result = getAirportCoordinates('LAX');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Los Angeles International');
  });

  it('handles 3-letter code for JFK', () => {
    const result = getAirportCoordinates('JFK');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('John F. Kennedy International');
  });

  // --- International airports ---
  it('returns coordinates for international airports (no K prefix)', () => {
    const heathrow = getAirportCoordinates('EGLL');
    expect(heathrow).not.toBeNull();
    expect(heathrow!.name).toBe('London Heathrow');

    const toronto = getAirportCoordinates('CYYZ');
    expect(toronto).not.toBeNull();
    expect(toronto!.name).toBe('Toronto Pearson International');
  });

  // --- Alaska/Hawaii ---
  it('returns coordinates for Alaska airports', () => {
    const anchorage = getAirportCoordinates('PANC');
    expect(anchorage).not.toBeNull();
    expect(anchorage!.city).toBe('Anchorage');
  });

  it('returns coordinates for Hawaii airports', () => {
    const honolulu = getAirportCoordinates('PHNL');
    expect(honolulu).not.toBeNull();
    expect(honolulu!.city).toBe('Honolulu');
  });

  // --- General aviation airports ---
  it('returns coordinates for GA airports', () => {
    const vanNuys = getAirportCoordinates('KVNY');
    expect(vanNuys).not.toBeNull();
    expect(vanNuys!.type).toBe('medium_airport');
    expect(vanNuys!.city).toBe('Van Nuys');
  });

  // --- Elevation data ---
  it('includes elevation data for airports that have it', () => {
    const denver = getAirportCoordinates('KDEN');
    expect(denver).not.toBeNull();
    expect(denver!.elevation).toBe(5431);
  });
});

describe('searchAirports', () => {
  it('finds airports by ICAO code', () => {
    const results = searchAirports('KLAX');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].code).toBe('KLAX');
    expect(results[0].name).toBe('Los Angeles International');
  });

  it('finds airports by partial code', () => {
    const results = searchAirports('KLA');
    expect(results.length).toBeGreaterThanOrEqual(1);
    // KLAX, KLAS, KLAL, etc. should match
    const codes = results.map(r => r.code);
    expect(codes.some(c => c.startsWith('KLA'))).toBe(true);
  });

  it('finds airports by name', () => {
    const results = searchAirports('Heathrow');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].code).toBe('EGLL');
    expect(results[0].name).toContain('Heathrow');
  });

  it('finds airports by city name', () => {
    const results = searchAirports('Denver');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const denverAirport = results.find(r => r.code === 'KDEN');
    expect(denverAirport).toBeDefined();
    expect(denverAirport!.city).toBe('Denver');
  });

  it('is case-insensitive', () => {
    const upper = searchAirports('CHICAGO');
    const lower = searchAirports('chicago');
    expect(upper.length).toBe(lower.length);
    expect(upper.map(r => r.code)).toEqual(lower.map(r => r.code));
  });

  it('respects the limit parameter', () => {
    const results = searchAirports('K', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('defaults limit to 10', () => {
    // 'K' will match a huge number of airports, should be capped at 10
    const results = searchAirports('K');
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('returns empty array for queries that match nothing', () => {
    const results = searchAirports('xyznonexistent123');
    expect(results).toEqual([]);
  });

  it('trims whitespace in query', () => {
    const results = searchAirports('  KLAX  ');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].code).toBe('KLAX');
  });

  it('returns results with code, lat, lng, and name properties', () => {
    const results = searchAirports('KJFK');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const jfk = results[0];
    expect(jfk).toHaveProperty('code');
    expect(jfk).toHaveProperty('lat');
    expect(jfk).toHaveProperty('lng');
    expect(jfk).toHaveProperty('name');
  });
});

describe('getAirportsInBounds', () => {
  it('returns airports within the bounding box', () => {
    // Bounding box around the NYC metro area
    const results = getAirportsInBounds(41.5, 40.0, -73.0, -75.0);
    expect(results.length).toBeGreaterThan(0);

    // JFK, LGA, EWR should all be in this box
    const codes = results.map(r => r.code);
    expect(codes).toContain('KJFK');
    expect(codes).toContain('KLGA');
    expect(codes).toContain('KEWR');
  });

  it('returns empty array when no airports are in bounds', () => {
    // Middle of the ocean
    const results = getAirportsInBounds(0.1, 0.0, 0.1, 0.0);
    expect(results).toEqual([]);
  });

  it('includes airports exactly on the boundary', () => {
    // Get KLAX coordinates and make a tight bounding box around it
    const lax = airportDatabase['KLAX'];
    const results = getAirportsInBounds(
      lax.lat + 0.001,
      lax.lat - 0.001,
      lax.lng + 0.001,
      lax.lng - 0.001
    );
    const codes = results.map(r => r.code);
    expect(codes).toContain('KLAX');
  });

  it('returns results with the correct shape', () => {
    const results = getAirportsInBounds(42.0, 41.0, -87.0, -88.0);
    if (results.length > 0) {
      const airport = results[0];
      expect(airport).toHaveProperty('code');
      expect(airport).toHaveProperty('lat');
      expect(airport).toHaveProperty('lng');
      expect(airport).toHaveProperty('name');
    }
  });

  it('returns a large number of airports for a wide bounding box', () => {
    // Entire continental US
    const results = getAirportsInBounds(50, 24, -65, -125);
    expect(results.length).toBeGreaterThan(50);
  });

  it('returns fewer airports for a narrow bounding box', () => {
    const wide = getAirportsInBounds(50, 24, -65, -125);
    const narrow = getAirportsInBounds(34.0, 33.9, -118.3, -118.5);
    expect(narrow.length).toBeLessThan(wide.length);
  });
});

describe('getApproximatePosition', () => {
  it('returns an object with lat, lng, and name', () => {
    const result = getApproximatePosition('KZZZ');
    expect(result).toHaveProperty('lat');
    expect(result).toHaveProperty('lng');
    expect(result).toHaveProperty('name');
    expect(typeof result.lat).toBe('number');
    expect(typeof result.lng).toBe('number');
  });

  it('normalizes code to uppercase', () => {
    const result = getApproximatePosition('kzzz');
    expect(result.name).toBe('KZZZ');
  });

  it('returns estimated city as "Unknown Location (Estimated)"', () => {
    const result = getApproximatePosition('KZZZ');
    expect(result.city).toBe('Unknown Location (Estimated)');
  });

  it('returns regional estimates for US K-prefix codes', () => {
    const result = getApproximatePosition('KXYZ');
    // Should be roughly within US continental bounds
    expect(result.lat).toBeGreaterThan(20);
    expect(result.lat).toBeLessThan(55);
    expect(result.lng).toBeGreaterThan(-130);
    expect(result.lng).toBeLessThan(-60);
  });

  it('returns regional estimates for Canadian CY-prefix codes', () => {
    const result = getApproximatePosition('CYXX');
    // Should be roughly centered on Canada
    expect(result.lat).toBeGreaterThan(35);
    expect(result.lat).toBeLessThan(60);
  });

  it('returns regional estimates for Mexican MM-prefix codes', () => {
    const result = getApproximatePosition('MMZZ');
    // Should be roughly centered on Mexico
    expect(result.lat).toBeGreaterThan(15);
    expect(result.lat).toBeLessThan(35);
  });

  it('returns deterministic results (same code produces same coordinates)', () => {
    const result1 = getApproximatePosition('KZZZ');
    const result2 = getApproximatePosition('KZZZ');
    expect(result1.lat).toBe(result2.lat);
    expect(result1.lng).toBe(result2.lng);
  });

  it('returns different coordinates for different codes', () => {
    const result1 = getApproximatePosition('KABC');
    const result2 = getApproximatePosition('KXYZ');
    // Highly unlikely to produce identical coordinates for different inputs
    const sameCoords = result1.lat === result2.lat && result1.lng === result2.lng;
    expect(sameCoords).toBe(false);
  });

  it('handles completely unknown prefix patterns with fallback to continental US center', () => {
    // A code with no matching prefix
    const result = getApproximatePosition('ZZZZ');
    // The fallback should be near continental US center (lat ~39, lng ~-98)
    expect(result.lat).toBeGreaterThan(25);
    expect(result.lat).toBeLessThan(55);
    expect(result.lng).toBeGreaterThan(-120);
    expect(result.lng).toBeLessThan(-75);
  });
});
