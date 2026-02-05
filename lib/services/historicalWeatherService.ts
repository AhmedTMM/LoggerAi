/**
 * Historical Weather Service
 * Fetches historical METAR data for flight analysis
 * Uses Iowa State ASOS network (free, aviation-specific)
 */

interface HistoricalMETAR {
  airport: string;
  date: string;
  metar: string;
  conditions: {
    visibility?: number; // statute miles
    ceiling?: number; // feet AGL
    skyConditions?: Array<{
      coverage: string; // CLR, FEW, SCT, BKN, OVC
      altitude?: number; // feet AGL
    }>;
    wind?: {
      speed: number; // knots
      direction: number; // degrees
      gust?: number; // knots
    };
    temperature?: number; // Celsius
    dewpoint?: number; // Celsius
    altimeter?: number; // inHg
    flightCategory: 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | 'UNKNOWN';
  };
}

/**
 * Fetch historical METAR for a specific airport and date
 * Uses Iowa State ASOS archive
 */
export async function fetchHistoricalMETAR(
  airport: string,
  date: Date
): Promise<HistoricalMETAR | null> {
  try {
    // Format date for Iowa State API (YYYY/MM/DD)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    // Clean up airport code (remove K prefix for US airports)
    // Iowa State ASOS uses 3-letter codes (e.g., RHV not KRHV)
    let cleanAirport = airport.toUpperCase().trim();
    if (cleanAirport.startsWith('K') && cleanAirport.length === 4) {
      cleanAirport = cleanAirport.substring(1); // Remove K prefix for US airports
    }

    // Iowa State ASOS archive URL
    const url = `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=${cleanAirport}&data=all&year1=${year}&month1=${month}&day1=${day}&year2=${year}&month2=${month}&day2=${day}&tz=Etc/UTC&format=onlycomma&latlon=no&elev=no&missing=null&trace=null&direct=no`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const csvText = await response.text();
    const lines = csvText.trim().split('\n');

    // Skip header, get first data line
    if (lines.length < 2) return null;

    const data = lines[1].split(',');

    // Parse CSV data
    // Columns: station, valid, tmpf, dwpf, relh, drct, sknt, p01i, alti, mslp, vsby, gust, skyc1-4, skyl1-4, wxcodes...
    const visibility = parseFloat(data[10]) || undefined; // vsby in statute miles (column 10)
    const windDir = parseInt(data[5]) || undefined;
    const windSpeed = parseInt(data[6]) || undefined;
    const windGust = parseFloat(data[11]) || undefined; // gust is column 11
    const temp = parseFloat(data[2]) ? ((parseFloat(data[2]) - 32) * 5/9) : undefined; // F to C
    const dewpoint = parseFloat(data[3]) ? ((parseFloat(data[3]) - 32) * 5/9) : undefined;
    const altimeter = parseFloat(data[8]) || undefined;
    const metar = data[data.length - 1] || 'No METAR available';

    // Parse sky conditions (coverage and altitude)
    const skyConditions = parseSkyConditions(
      data[12], data[13], data[14], data[15], // skyc1-4 (columns 12-15)
      data[16], data[17], data[18], data[19]  // skyl1-4 (columns 16-19)
    );
    const ceiling = findCeiling(skyConditions);

    // Determine flight category
    const flightCategory = determineFlightCategory(visibility, ceiling);

    return {
      airport,
      date: date.toISOString(),
      metar,
      conditions: {
        visibility,
        ceiling,
        skyConditions,
        wind: windDir && windSpeed ? {
          direction: windDir,
          speed: windSpeed,
          gust: windGust
        } : undefined,
        temperature: temp,
        dewpoint: dewpoint,
        altimeter,
        flightCategory
      }
    };

  } catch {
    return null;
  }
}

/**
 * Parse sky conditions from CSV data
 * Returns array of sky layers with coverage and altitude
 */
function parseSkyConditions(
  skyc1: string, skyc2: string, skyc3: string, skyc4: string,
  skyl1: string, skyl2: string, skyl3: string, skyl4: string
): Array<{ coverage: string; altitude?: number }> {
  const conditions: Array<{ coverage: string; altitude?: number }> = [];

  const coverages = [skyc1, skyc2, skyc3, skyc4];
  const levels = [skyl1, skyl2, skyl3, skyl4];

  for (let i = 0; i < 4; i++) {
    const coverage = coverages[i];
    const altitude = parseInt(levels[i]);

    // Skip null/empty values
    if (!coverage || coverage === 'null' || coverage === '') continue;

    conditions.push({
      coverage: coverage,
      altitude: !isNaN(altitude) ? altitude : undefined
    });
  }

  return conditions;
}

/**
 * Find ceiling from sky conditions
 * Ceiling is the lowest BKN or OVC layer
 */
function findCeiling(skyConditions: Array<{ coverage: string; altitude?: number }>): number | undefined {
  for (const layer of skyConditions) {
    if ((layer.coverage === 'OVC' || layer.coverage === 'BKN') && layer.altitude !== undefined) {
      return layer.altitude;
    }
  }
  return undefined;
}

/**
 * Determine flight category based on visibility and ceiling
 */
function determineFlightCategory(
  visibility: number | undefined,
  ceiling: number | undefined
): 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | 'UNKNOWN' {
  if (visibility === undefined && ceiling === undefined) {
    return 'UNKNOWN';
  }

  const vis = visibility ?? 10; // If no vis, assume good
  const ceil = ceiling ?? 10000; // If no ceiling, assume high

  // LIFR: Ceiling < 500ft OR Visibility < 1sm
  if (ceil < 500 || vis < 1) {
    return 'LIFR';
  }

  // IFR: Ceiling 500-999ft OR Visibility 1-2sm
  if (ceil < 1000 || vis < 3) {
    return 'IFR';
  }

  // MVFR: Ceiling 1000-2999ft OR Visibility 3-4sm
  if (ceil < 3000 || vis <= 5) {
    return 'MVFR';
  }

  // VFR: Ceiling ≥ 3000ft AND Visibility > 5sm
  return 'VFR';
}
