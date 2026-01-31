import { IWeatherData } from '../models/Flight';

// Enhanced Weather Service using aviationweather.gov (ADDS) API
// Provides comprehensive METAR and TAF data for flight safety analysis

export interface IEnhancedWeatherData extends IWeatherData {
  // Extended METAR data
  temperature?: number;
  dewpoint?: number;
  altimeter?: number;
  densityAltitude?: number;
  pressureAltitude?: number;
  flightRules?: string;
  rawMetar?: string;
  observationTime?: Date;

  // TAF data
  taf?: string;
  tafParsed?: ITAFPeriod[];
  tafValidFrom?: Date;
  tafValidTo?: Date;

  // Destination weather (for XC flights)
  destinationWeather?: IWeatherData;

  // Weather trend
  trend?: 'improving' | 'stable' | 'deteriorating';

  // Hazards
  hazards?: IWeatherHazard[];
}

export interface ITAFPeriod {
  type: 'FM' | 'TEMPO' | 'BECMG' | 'PROB';
  probability?: number;
  startTime: Date;
  endTime?: Date;
  wind?: { direction: number; speed: number; gust?: number };
  visibility?: number;
  ceiling?: number;
  flightCategory: 'VFR' | 'MVFR' | 'IFR' | 'LIFR';
  weather?: string[];
  raw?: string;
}

export interface IWeatherHazard {
  type: 'SIGMET' | 'AIRMET' | 'CONVECTIVE' | 'PIREP' | 'CWA';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'extreme';
  validFrom?: Date;
  validTo?: Date;
  affectedAltitudes?: { low: number; high: number };
}

// Helper to safely parse JSON from response
async function safeJsonParse<T>(response: Response): Promise<T | null> {
  try {
    const text = await response.text();
    if (!text || text.trim() === '') {
      return null;
    }
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// Helper to sanitize visibility value (handles "10+", strings, etc.)
function sanitizeVisibility(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    // Handle "10+" or similar strings
    const numericPart = parseFloat(value.replace(/[^0-9.]/g, ''));
    return isNaN(numericPart) ? 10 : numericPart;
  }
  return 10; // Default to 10SM (good visibility)
}

// Helper to sanitize wind direction (handles "VRB" for variable winds)
function sanitizeWindDirection(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    // "VRB" means variable - use 0 as convention
    if (value.toUpperCase() === 'VRB') {
      return 0;
    }
    const numericPart = parseFloat(value);
    return isNaN(numericPart) ? 0 : numericPart;
  }
  return 0;
}

// Helper to sanitize wind speed
function sanitizeWindSpeed(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const numericPart = parseFloat(value);
    return isNaN(numericPart) ? 0 : numericPart;
  }
  return 0;
}

// Main METAR fetching function with enhanced parsing
export async function fetchWeatherData(airportCode: string): Promise<IWeatherData | null> {
  try {
    const station = airportCode.toUpperCase().replace(/^K/, '');
    const stationCode = airportCode.length === 3 ? `K${station}` : airportCode.toUpperCase();

    // Fetch METAR from aviationweather.gov API
    const url = `https://aviationweather.gov/api/data/metar?ids=${stationCode}&format=json&hours=1`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error('Weather API error:', response.status);
      return null;
    }

    const data = await safeJsonParse<any[]>(response);

    if (!data || data.length === 0) {
      return null;
    }

    const metar = data[0];
    const flightCategory = determineFlightCategory(metar.visib, metar.clouds);
    const ceiling = findCeiling(metar.clouds);

    return {
      station: stationCode,
      metar: metar.rawOb || '',
      flightCategory,
      visibility: sanitizeVisibility(metar.visib),
      ceiling,
      wind: {
        direction: sanitizeWindDirection(metar.wdir),
        speed: sanitizeWindSpeed(metar.wspd),
        gust: metar.wgst ? sanitizeWindSpeed(metar.wgst) : undefined,
      },
      fetchedAt: new Date(),
    };
  } catch (error) {
    console.error('Error fetching weather:', error);
    return null;
  }
}

// Enhanced METAR fetch with all available data
export async function fetchEnhancedWeatherData(airportCode: string): Promise<IEnhancedWeatherData | null> {
  try {
    const station = airportCode.toUpperCase().replace(/^K/, '');
    const stationCode = airportCode.length === 3 ? `K${station}` : airportCode.toUpperCase();

    // Fetch METAR with decoded data
    const metarUrl = `https://aviationweather.gov/api/data/metar?ids=${stationCode}&format=json&hours=3`;
    const response = await fetch(metarUrl);

    if (!response.ok) {
      console.error('Enhanced Weather API error:', response.status);
      return null;
    }

    const data = await safeJsonParse<any[]>(response);

    if (!data || data.length === 0) {
      return null;
    }

    const metar = data[0];
    const flightCategory = determineFlightCategory(metar.visib, metar.clouds);
    const ceiling = findCeiling(metar.clouds);

    // Calculate density altitude if we have temperature and altimeter
    let densityAltitude: number | undefined;
    let pressureAltitude: number | undefined;

    if (metar.altim && metar.elev !== undefined) {
      // Pressure altitude = field elevation + ((29.92 - altimeter) * 1000)
      const altimeterInHg = metar.altim * 0.02953; // Convert mb to inHg if needed
      pressureAltitude = Math.round(metar.elev + ((29.92 - altimeterInHg) * 1000));

      // Density altitude = pressure altitude + (120 * (OAT - ISA temp))
      // ISA temp at sea level = 15°C, decreases 2°C per 1000ft
      if (metar.temp !== undefined) {
        const isaTemp = 15 - (metar.elev / 1000 * 2);
        densityAltitude = Math.round(pressureAltitude + (120 * (metar.temp - isaTemp)));
      }
    }

    // Analyze weather trend from multiple observations
    let trend: 'improving' | 'stable' | 'deteriorating' = 'stable';
    if (data.length >= 2) {
      const currentCat = flightCategoryToNumber(flightCategory);
      const previousCat = flightCategoryToNumber(
        determineFlightCategory(data[1].visib, data[1].clouds)
      );
      if (currentCat > previousCat) trend = 'improving';
      else if (currentCat < previousCat) trend = 'deteriorating';
    }

    // Parse weather phenomena for hazards
    const hazards = parseWeatherHazards(metar);

    return {
      station: stationCode,
      metar: metar.rawOb || '',
      rawMetar: metar.rawOb,
      flightCategory,
      visibility: sanitizeVisibility(metar.visib),
      ceiling,
      wind: {
        direction: sanitizeWindDirection(metar.wdir),
        speed: sanitizeWindSpeed(metar.wspd),
        gust: metar.wgst ? sanitizeWindSpeed(metar.wgst) : undefined,
      },
      temperature: metar.temp,
      dewpoint: metar.dewp,
      altimeter: metar.altim,
      densityAltitude,
      pressureAltitude,
      observationTime: metar.obsTime ? new Date(metar.obsTime * 1000) : new Date(),
      trend,
      hazards,
      fetchedAt: new Date(),
    };
  } catch (error) {
    console.error('Error fetching enhanced weather:', error);
    return null;
  }
}

// Fetch and parse TAF data
export async function fetchTAFData(airportCode: string): Promise<string | null> {
  try {
    const station = airportCode.toUpperCase().replace(/^K/, '');
    const stationCode = airportCode.length === 3 ? `K${station}` : airportCode.toUpperCase();

    const url = `https://aviationweather.gov/api/data/taf?ids=${stationCode}&format=json`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await safeJsonParse<any[]>(response);

    if (!data || data.length === 0) {
      return null;
    }

    return data[0].rawTAF || null;
  } catch (error) {
    console.error('Error fetching TAF:', error);
    return null;
  }
}

// Fetch parsed TAF with forecast periods
export async function fetchParsedTAF(airportCode: string): Promise<{ raw: string; periods: ITAFPeriod[] } | null> {
  try {
    const station = airportCode.toUpperCase().replace(/^K/, '');
    const stationCode = airportCode.length === 3 ? `K${station}` : airportCode.toUpperCase();

    const url = `https://aviationweather.gov/api/data/taf?ids=${stationCode}&format=json`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await safeJsonParse<any[]>(response);

    if (!data || data.length === 0) {
      return null;
    }

    const tafData = data[0];
    const periods = parseTAFPeriods(tafData);

    return {
      raw: tafData.rawTAF || '',
      periods,
    };
  } catch (error) {
    console.error('Error fetching parsed TAF:', error);
    return null;
  }
}

// Fetch weather for a specific time (uses TAF if future, METAR if now)
export async function fetchWeatherForTime(
  airportCode: string,
  scheduledTime: Date
): Promise<IEnhancedWeatherData | null> {
  const now = new Date();
  const hoursUntilFlight = (scheduledTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  // If flight is within 1 hour, use current METAR
  if (hoursUntilFlight <= 1) {
    return fetchEnhancedWeatherData(airportCode);
  }

  // For future flights, get both METAR (current) and TAF (forecast)
  const [currentWeather, tafData] = await Promise.all([
    fetchEnhancedWeatherData(airportCode),
    fetchParsedTAF(airportCode),
  ]);

  if (!currentWeather) {
    return null;
  }

  // Find the TAF period that covers the scheduled flight time
  if (tafData && tafData.periods.length > 0) {
    const relevantPeriod = tafData.periods.find(period => {
      const periodStart = period.startTime.getTime();
      const periodEnd = period.endTime?.getTime() || periodStart + 6 * 60 * 60 * 1000;
      return scheduledTime.getTime() >= periodStart && scheduledTime.getTime() <= periodEnd;
    });

    if (relevantPeriod) {
      // Override current conditions with forecasted conditions
      return {
        ...currentWeather,
        taf: tafData.raw,
        tafParsed: tafData.periods,
        // Use forecasted conditions for the flight time
        flightCategory: relevantPeriod.flightCategory,
        visibility: relevantPeriod.visibility ?? currentWeather.visibility,
        ceiling: relevantPeriod.ceiling ?? currentWeather.ceiling,
        wind: relevantPeriod.wind ?? currentWeather.wind,
      };
    }
  }

  // Return current weather with TAF attached
  return {
    ...currentWeather,
    taf: tafData?.raw,
    tafParsed: tafData?.periods,
  };
}

// Fetch weather for both departure and arrival airports
export async function fetchRouteWeather(
  departureAirport: string,
  arrivalAirport?: string,
  scheduledTime?: Date
): Promise<{
  departure: IEnhancedWeatherData | null;
  arrival: IEnhancedWeatherData | null;
  enroute: IWeatherHazard[];
}> {
  const fetchTime = scheduledTime || new Date();

  const departureWeather = await fetchWeatherForTime(departureAirport, fetchTime);

  let arrivalWeather: IEnhancedWeatherData | null = null;
  if (arrivalAirport && arrivalAirport !== departureAirport) {
    // Add estimated enroute time for arrival weather forecast
    const enrouteHours = 2; // Default estimate
    const arrivalTime = new Date(fetchTime.getTime() + enrouteHours * 60 * 60 * 1000);
    arrivalWeather = await fetchWeatherForTime(arrivalAirport, arrivalTime);
  }

  // Fetch enroute hazards (SIGMETs, AIRMETs)
  const enrouteHazards = await fetchEnrouteHazards(departureAirport, arrivalAirport);

  return {
    departure: departureWeather,
    arrival: arrivalWeather,
    enroute: enrouteHazards,
  };
}

// Fetch SIGMETs and AIRMETs for enroute
async function fetchEnrouteHazards(
  departure: string,
  arrival?: string
): Promise<IWeatherHazard[]> {
  try {
    // Fetch current SIGMETs
    const sigmetUrl = 'https://aviationweather.gov/api/data/airsigmet?format=json&type=sigmet';
    const airmetUrl = 'https://aviationweather.gov/api/data/airsigmet?format=json&type=airmet';

    const [sigmetRes, airmetRes] = await Promise.all([
      fetch(sigmetUrl).catch(() => null),
      fetch(airmetUrl).catch(() => null),
    ]);

    const hazards: IWeatherHazard[] = [];

    if (sigmetRes?.ok) {
      const sigmets = await safeJsonParse<any[]>(sigmetRes);
      for (const sigmet of sigmets || []) {
        hazards.push({
          type: 'SIGMET',
          description: sigmet.rawAirSigmet || sigmet.hazard || 'SIGMET Active',
          severity: 'high',
          validFrom: sigmet.validTimeFrom ? new Date(sigmet.validTimeFrom * 1000) : undefined,
          validTo: sigmet.validTimeTo ? new Date(sigmet.validTimeTo * 1000) : undefined,
        });
      }
    }

    if (airmetRes?.ok) {
      const airmets = await safeJsonParse<any[]>(airmetRes);
      for (const airmet of airmets || []) {
        hazards.push({
          type: 'AIRMET',
          description: airmet.rawAirSigmet || airmet.hazard || 'AIRMET Active',
          severity: airmet.hazard?.includes('IFR') || airmet.hazard?.includes('ICE') ? 'medium' : 'low',
          validFrom: airmet.validTimeFrom ? new Date(airmet.validTimeFrom * 1000) : undefined,
          validTo: airmet.validTimeTo ? new Date(airmet.validTimeTo * 1000) : undefined,
        });
      }
    }

    return hazards;
  } catch (error) {
    console.error('Error fetching enroute hazards:', error);
    return [];
  }
}

// Parse TAF into individual forecast periods
function parseTAFPeriods(tafData: any): ITAFPeriod[] {
  const periods: ITAFPeriod[] = [];

  // Parse the forecast array if available
  if (tafData.fcsts && Array.isArray(tafData.fcsts)) {
    for (const fcst of tafData.fcsts) {
      const startTime = fcst.timeFrom ? new Date(fcst.timeFrom * 1000) : new Date();
      const endTime = fcst.timeTo ? new Date(fcst.timeTo * 1000) : undefined;

      const period: ITAFPeriod = {
        type: fcst.fcstType || 'FM',
        probability: fcst.probability,
        startTime,
        endTime,
        flightCategory: determineFlightCategory(fcst.visib, fcst.clouds),
        visibility: fcst.visib !== undefined ? sanitizeVisibility(fcst.visib) : undefined,
        ceiling: findCeiling(fcst.clouds),
        wind: fcst.wdir !== undefined ? {
          direction: sanitizeWindDirection(fcst.wdir),
          speed: sanitizeWindSpeed(fcst.wspd),
          gust: fcst.wgst ? sanitizeWindSpeed(fcst.wgst) : undefined,
        } : undefined,
        weather: fcst.wxString ? [fcst.wxString] : undefined,
      };

      periods.push(period);
    }
  }

  return periods;
}

// Parse weather phenomena from METAR for hazards
function parseWeatherHazards(metar: any): IWeatherHazard[] {
  const hazards: IWeatherHazard[] = [];
  const wxString = metar.wxString || '';

  // Thunderstorms
  if (wxString.includes('TS') || wxString.includes('CB')) {
    hazards.push({
      type: 'CONVECTIVE',
      description: 'Thunderstorm activity reported',
      severity: 'extreme',
    });
  }

  // Freezing precipitation
  if (wxString.includes('FZ') || wxString.includes('FZRA') || wxString.includes('FZDZ')) {
    hazards.push({
      type: 'AIRMET',
      description: 'Freezing precipitation',
      severity: 'high',
    });
  }

  // Low visibility phenomena
  if (wxString.includes('FG') || wxString.includes('BR') || wxString.includes('HZ')) {
    const vis = metar.visib || 10;
    if (vis < 3) {
      hazards.push({
        type: 'AIRMET',
        description: `Reduced visibility: ${vis}SM in ${wxString}`,
        severity: vis < 1 ? 'high' : 'medium',
      });
    }
  }

  // Strong winds
  const windSpeed = metar.wspd || 0;
  const gustSpeed = metar.wgst || 0;
  if (windSpeed >= 25 || gustSpeed >= 35) {
    hazards.push({
      type: 'AIRMET',
      description: `Strong winds: ${windSpeed}kt${gustSpeed ? ` gusting ${gustSpeed}kt` : ''}`,
      severity: gustSpeed >= 40 ? 'high' : 'medium',
    });
  }

  return hazards;
}

// Determine flight category from visibility and clouds
function determineFlightCategory(
  visibility: number | string | undefined,
  clouds: Array<{ cover: string; base: number }> | undefined
): 'VFR' | 'MVFR' | 'IFR' | 'LIFR' {
  const vis = sanitizeVisibility(visibility);
  const ceiling = findCeiling(clouds);

  // LIFR: Ceiling < 500 feet and/or visibility < 1 mile
  if (ceiling !== undefined && ceiling < 500) return 'LIFR';
  if (vis < 1) return 'LIFR';

  // IFR: Ceiling 500-1000 feet and/or visibility 1-3 miles
  if (ceiling !== undefined && ceiling < 1000) return 'IFR';
  if (vis < 3) return 'IFR';

  // MVFR: Ceiling 1000-3000 feet and/or visibility 3-5 miles
  if (ceiling !== undefined && ceiling < 3000) return 'MVFR';
  if (vis < 5) return 'MVFR';

  // VFR: Ceiling > 3000 feet and visibility > 5 miles
  return 'VFR';
}

// Find ceiling (lowest BKN or OVC layer)
function findCeiling(
  clouds: Array<{ cover: string; base: number }> | undefined
): number | undefined {
  if (!clouds || clouds.length === 0) return undefined;

  for (const layer of clouds) {
    if (layer.cover === 'BKN' || layer.cover === 'OVC') {
      return layer.base;
    }
  }

  return undefined;
}

// Convert flight category to numeric for comparison
function flightCategoryToNumber(category: 'VFR' | 'MVFR' | 'IFR' | 'LIFR'): number {
  switch (category) {
    case 'VFR': return 4;
    case 'MVFR': return 3;
    case 'IFR': return 2;
    case 'LIFR': return 1;
    default: return 0;
  }
}

// Analyze weather against aircraft performance limits
export function analyzeWeatherVsAircraft(
  weather: IEnhancedWeatherData,
  aircraft: {
    operatingLimits?: {
      vSpeeds?: { va?: number };
      weights?: { maxGross?: number };
    };
    model?: string;
  }
): {
  safeToOperate: boolean;
  warnings: string[];
  recommendations: string[];
} {
  const warnings: string[] = [];
  const recommendations: string[] = [];
  let safeToOperate = true;

  // Check crosswind component (assuming runway alignment)
  const windSpeed = weather.wind?.speed || 0;
  const gustSpeed = weather.wind?.gust || windSpeed;

  // Most light aircraft have ~15kt demonstrated crosswind
  if (gustSpeed > 20) {
    warnings.push(`High winds: ${windSpeed}kt gusting ${gustSpeed}kt may exceed aircraft crosswind limits`);
    if (gustSpeed > 25) safeToOperate = false;
  }

  // Check density altitude for performance
  if (weather.densityAltitude !== undefined && weather.densityAltitude > 7000) {
    warnings.push(`High density altitude: ${weather.densityAltitude}ft - expect reduced performance`);
    recommendations.push('Reduce payload, plan for longer takeoff roll, reduced climb rate');
    if (weather.densityAltitude > 9000) {
      safeToOperate = false;
      warnings.push('CRITICAL: Density altitude may exceed aircraft performance capabilities');
    }
  }

  // Check maneuvering speed adjustment for turbulence
  if (weather.hazards?.some(h => h.description.toLowerCase().includes('turbulence'))) {
    if (aircraft.operatingLimits?.vSpeeds?.va) {
      recommendations.push(`Reduce speed to Va (${aircraft.operatingLimits.vSpeeds.va}kt) or below in turbulence`);
    } else {
      recommendations.push('Reduce to maneuvering speed (Va) in turbulence');
    }
  }

  // Check for hazardous conditions
  for (const hazard of weather.hazards || []) {
    if (hazard.severity === 'extreme') {
      safeToOperate = false;
      warnings.push(`CRITICAL: ${hazard.description}`);
    } else if (hazard.severity === 'high') {
      warnings.push(`WARNING: ${hazard.description}`);
    }
  }

  return { safeToOperate, warnings, recommendations };
}

// Analyze weather against pilot capabilities
export function analyzeWeatherVsPilot(
  weather: IEnhancedWeatherData,
  pilot: {
    certificates: { instrumentRated?: boolean; type?: string };
    experience: {
      totalHours?: number;
      nightHours?: number;
      ifrHours?: number;
      crossCountryHours?: number;
    };
    endorsements?: { type: string }[];
  }
): {
  legal: boolean;
  safeRecommendation: boolean;
  warnings: string[];
  recommendations: string[];
} {
  const warnings: string[] = [];
  const recommendations: string[] = [];
  let legal = true;
  let safeRecommendation = true;

  const isInstrumentRated = pilot.certificates?.instrumentRated;
  const totalHours = pilot.experience?.totalHours || 0;
  const nightHours = pilot.experience?.nightHours || 0;
  const ifrHours = pilot.experience?.ifrHours || 0;
  const isStudent = pilot.certificates?.type === 'Student';

  // IFR/LIFR conditions check
  if (weather.flightCategory === 'IFR' || weather.flightCategory === 'LIFR') {
    if (!isInstrumentRated) {
      legal = false;
      safeRecommendation = false;
      warnings.push(`${weather.flightCategory} conditions require instrument rating`);
    } else if (ifrHours < 50) {
      safeRecommendation = false;
      warnings.push(`Low IFR experience (${ifrHours}hrs) for ${weather.flightCategory} conditions`);
      recommendations.push('Consider flying with an experienced IFR pilot or CFII');
    }
  }

  // MVFR conditions for low-time pilots
  if (weather.flightCategory === 'MVFR') {
    if (isStudent) {
      legal = false;
      warnings.push('Student pilots should not fly in MVFR conditions');
    } else if (totalHours < 100) {
      safeRecommendation = false;
      warnings.push(`MVFR conditions challenging for ${totalHours} total hours`);
      recommendations.push('Consider postponing or flying with a more experienced pilot');
    }
  }

  // Wind checks based on experience
  const maxWind = Math.max(weather.wind?.speed || 0, weather.wind?.gust || 0);
  if (maxWind >= 20) {
    if (totalHours < 50) {
      safeRecommendation = false;
      warnings.push(`Strong winds (${maxWind}kt) challenging for ${totalHours} hour pilot`);
    }
    if (maxWind >= 30) {
      safeRecommendation = false;
      warnings.push(`Excessive winds: ${maxWind}kt`);
    }
  }

  // Night flight checks
  const hour = new Date().getHours();
  const isNightTime = hour >= 19 || hour <= 6;
  if (isNightTime) {
    if (isStudent && !pilot.endorsements?.some(e => e.type === 'Night')) {
      legal = false;
      warnings.push('Student pilot night flight requires endorsement');
    }
    if (nightHours < 20 && weather.flightCategory !== 'VFR') {
      safeRecommendation = false;
      warnings.push(`Limited night experience (${nightHours}hrs) combined with ${weather.flightCategory} conditions`);
    }
  }

  // Density altitude awareness for low-time pilots
  if (weather.densityAltitude !== undefined && weather.densityAltitude > 5000) {
    if (totalHours < 100) {
      warnings.push(`High density altitude (${weather.densityAltitude}ft) - be aware of performance impacts`);
      recommendations.push('Review high altitude operations procedures');
    }
  }

  return { legal, safeRecommendation, warnings, recommendations };
}
