// FAA Scraping Service - Magic Add Aircraft
// Scrapes FAA registration data and uses AI to extract airworthiness information

import {
  isOpenRouterConfigured,
  generateCompletion,
  parseJsonResponse,
  OPENROUTER_MODELS,
} from './openRouterClient';
import { fetchAircraftImage as fetchAircraftImageFromFirecrawl } from './firecrawlService';

export interface ScrapedAircraftData {
  tailNumber: string;
  manufacturer: string;
  model: string;
  year: number;
  serial: string;
  imageUrl?: string;
  pohUrl?: string;
  airworthinessStatus?: {
    annual?: Date;
    transponder?: Date;
    altimeter?: Date;
    staticSystem?: Date;
    vor?: Date;
    elt?: Date;
    hundredHour?: Date;
  };
  mel?: { item: string; required: boolean; remarks?: string }[];
  operatingLimits?: {
    vSpeeds?: {
      vso?: number;
      vs1?: number;
      vr?: number;
      vx?: number;
      vy?: number;
      vfe?: number;
      va?: number;
      vno?: number;
      vne?: number;
    };
    weights?: {
      maxGross?: number;
      empty?: number;
      usefulLoad?: number;
      fuelCapacity?: number;
    };
  };
  scrapedData: {
    lastScraped: Date;
    source: string;
    rawData?: any;
  };
}

interface FAARegistrationData {
  n_number: string;
  serial_number: string;
  mfr_mdl_code: string;
  eng_mfr_mdl: string;
  year_mfr: string;
  type_registrant: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip_code: string;
  region: string;
  county: string;
  country: string;
  last_action_date: string;
  cert_issue_date: string;
  certification: string;
  type_aircraft: string;
  type_engine: string;
  status_code: string;
  mode_s_code: string;
  fract_owner: string;
  air_worth_date: string;
  other_names_1?: string;
  other_names_2?: string;
  other_names_3?: string;
  other_names_4?: string;
  other_names_5?: string;
  expiration_date: string;
  unique_id: string;
  kit_mfr?: string;
  kit_model?: string;
  mode_s_code_hex?: string;
}

interface AircraftTypeData {
  manufacturer: string;
  model: string;
  typeDesignator?: string;
  numEngines?: number;
  engineType?: string;
  category?: string;
}

// FAA Registry API endpoint - using the public FAA N-number inquiry
const FAA_REGISTRY_BASE = 'https://registry.faa.gov/aircraftinquiry/Search/NNumberResult';

// ADS-B Exchange and other public aircraft databases for cross-referencing
const ADSB_EXCHANGE_API = 'https://api.adsbdb.com/v0/aircraft';

export async function scrapeAircraftByTailNumber(tailNumber: string): Promise<ScrapedAircraftData | null> {
  const cleanTailNumber = tailNumber.toUpperCase().replace(/^N/, '');
  const fullTailNumber = `N${cleanTailNumber}`;

  try {
    // Step 1: Try multiple data sources for accurate aircraft info
    let aircraftData: { manufacturer: string; model: string; year: number; serial: string } | null = null;

    // Source 1: Try ADS-B Exchange database (reliable for registered aircraft)
    aircraftData = await fetchFromADSBExchange(fullTailNumber);

    // Source 2: If ADS-B fails, try FAA registry
    if (!aircraftData) {
      const faaData = await fetchFAARegistration(cleanTailNumber);
      if (faaData) {
        const typeData = await lookupAircraftType(faaData.mfr_mdl_code, faaData);
        aircraftData = {
          manufacturer: typeData.manufacturer,
          model: typeData.model,
          year: parseInt(faaData.year_mfr) || new Date().getFullYear(),
          serial: faaData.serial_number,
        };
      }
    }

    // Source 3: Fallback to AI-based lookup with strict validation
    if (!aircraftData) {
      return await aiAircraftLookup(tailNumber);
    }

    // Step 2: Get POH and standard MEL via AI
    const aiEnhancements = await fetchAIEnhancements(aircraftData.manufacturer, aircraftData.model);

    // Step 3: Attempt to find aircraft image
    const imageUrl = await findAircraftImage(fullTailNumber, aircraftData.manufacturer, aircraftData.model);

    return {
      tailNumber: fullTailNumber,
      manufacturer: aircraftData.manufacturer,
      model: aircraftData.model,
      year: aircraftData.year,
      serial: aircraftData.serial,
      imageUrl,
      pohUrl: aiEnhancements.pohUrl,
      mel: aiEnhancements.mel,
      operatingLimits: aiEnhancements.operatingLimits,
      scrapedData: {
        lastScraped: new Date(),
        source: 'FAA Registry + ADS-B + AI Enhancement',
        rawData: aircraftData,
      },
    };
  } catch (error) {
    console.error('Aircraft scraping error:', error);
    return await aiAircraftLookup(tailNumber);
  }
}

// Fetch aircraft data from ADS-B Exchange database
async function fetchFromADSBExchange(tailNumber: string): Promise<{ manufacturer: string; model: string; year: number; serial: string } | null> {
  try {
    const response = await fetch(`${ADSB_EXCHANGE_API}/${tailNumber}`, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // ADS-B Exchange returns aircraft data with manufacturer and type info
    if (data.response?.aircraft) {
      const aircraft = data.response.aircraft;

      // Parse the type field which usually contains model info
      const typeInfo = parseAircraftType(aircraft.type || '', aircraft.manufacturer || '');

      return {
        manufacturer: aircraft.manufacturer || typeInfo.manufacturer || 'Unknown',
        model: aircraft.type || typeInfo.model || 'Unknown',
        year: aircraft.year_built ? parseInt(aircraft.year_built) : new Date().getFullYear(),
        serial: aircraft.serial || 'Unknown',
      };
    }

    return null;
  } catch (error) {
    console.warn('ADS-B Exchange lookup failed:', error);
    return null;
  }
}

// Parse aircraft type string to extract manufacturer and model
function parseAircraftType(typeString: string, manufacturer: string): { manufacturer: string; model: string } {
  // Common aircraft type codes (ICAO type designators)
  const typeCodeMap: Record<string, { manufacturer: string; model: string }> = {
    // Cessna
    'C172': { manufacturer: 'Cessna', model: '172 Skyhawk' },
    'C182': { manufacturer: 'Cessna', model: '182 Skylane' },
    'C150': { manufacturer: 'Cessna', model: '150' },
    'C152': { manufacturer: 'Cessna', model: '152' },
    'C206': { manufacturer: 'Cessna', model: '206 Stationair' },
    'C210': { manufacturer: 'Cessna', model: '210 Centurion' },
    'C310': { manufacturer: 'Cessna', model: '310' },
    'C402': { manufacturer: 'Cessna', model: '402' },
    'C208': { manufacturer: 'Cessna', model: '208 Caravan' },
    'C525': { manufacturer: 'Cessna', model: 'Citation CJ1' },
    'C560': { manufacturer: 'Cessna', model: 'Citation V' },
    // Piper
    'PA28': { manufacturer: 'Piper', model: 'PA-28 Cherokee' },
    'PA32': { manufacturer: 'Piper', model: 'PA-32 Cherokee Six' },
    'PA34': { manufacturer: 'Piper', model: 'PA-34 Seneca' },
    'PA44': { manufacturer: 'Piper', model: 'PA-44 Seminole' },
    'PA46': { manufacturer: 'Piper', model: 'PA-46 Malibu' },
    'PA18': { manufacturer: 'Piper', model: 'PA-18 Super Cub' },
    'PA24': { manufacturer: 'Piper', model: 'PA-24 Comanche' },
    // Beechcraft
    'BE33': { manufacturer: 'Beechcraft', model: 'Bonanza 33' },
    'BE35': { manufacturer: 'Beechcraft', model: 'Bonanza 35' },
    'BE36': { manufacturer: 'Beechcraft', model: 'Bonanza 36' },
    'BE58': { manufacturer: 'Beechcraft', model: 'Baron 58' },
    'BE76': { manufacturer: 'Beechcraft', model: 'Duchess' },
    'BE90': { manufacturer: 'Beechcraft', model: 'King Air 90' },
    'B350': { manufacturer: 'Beechcraft', model: 'King Air 350' },
    // Cirrus
    'SR20': { manufacturer: 'Cirrus', model: 'SR20' },
    'SR22': { manufacturer: 'Cirrus', model: 'SR22' },
    'SF50': { manufacturer: 'Cirrus', model: 'Vision Jet SF50' },
    // Diamond
    'DA40': { manufacturer: 'Diamond', model: 'DA40 Star' },
    'DA42': { manufacturer: 'Diamond', model: 'DA42 Twin Star' },
    'DA62': { manufacturer: 'Diamond', model: 'DA62' },
    // Mooney
    'M20': { manufacturer: 'Mooney', model: 'M20' },
    'M20P': { manufacturer: 'Mooney', model: 'M20P' },
    'M20T': { manufacturer: 'Mooney', model: 'M20T Bravo' },
  };

  const upperType = typeString.toUpperCase().replace(/[-\s]/g, '');

  // Try exact match first
  if (typeCodeMap[upperType]) {
    return typeCodeMap[upperType];
  }

  // Try partial match
  for (const [code, info] of Object.entries(typeCodeMap)) {
    if (upperType.includes(code) || code.includes(upperType)) {
      return info;
    }
  }

  // If we have a manufacturer, use it with the type string as model
  if (manufacturer) {
    return { manufacturer, model: typeString || 'Unknown' };
  }

  return { manufacturer: 'Unknown', model: typeString || 'Unknown' };
}

async function fetchFAARegistration(nNumber: string): Promise<FAARegistrationData | null> {
  try {
    // FAA provides a CSV download, but for real-time we use their inquiry page
    // In production, this would use their official API or web scraping
    // For now, we'll simulate with a mock or use the AI fallback

    // Try the FAA's public data API
    const response = await fetch(
      `https://api.faa.gov/s/registry/aircraft/nNumber/${nNumber}`,
      {
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data as FAARegistrationData;
    }

    return null;
  } catch (error) {
    console.warn('FAA API not available, using AI fallback');
    return null;
  }
}

async function lookupAircraftType(mfrMdlCode: string, faaData?: FAARegistrationData): Promise<AircraftTypeData> {
  // Comprehensive FAA manufacturer/model code mapping
  // FAA codes follow format: first 2-3 digits = manufacturer, remaining = model
  const manufacturerCodes: Record<string, { manufacturer: string; model: string }> = {
    // Cessna (codes starting with 2)
    '2072304': { manufacturer: 'Cessna', model: '172S Skyhawk' },
    '2073104': { manufacturer: 'Cessna', model: '172R Skyhawk' },
    '2073304': { manufacturer: 'Cessna', model: '172N Skyhawk' },
    '2073504': { manufacturer: 'Cessna', model: '172M Skyhawk' },
    '2073704': { manufacturer: 'Cessna', model: '172P Skyhawk' },
    '2072504': { manufacturer: 'Cessna', model: '182Q Skylane' },
    '2072604': { manufacturer: 'Cessna', model: '182S Skylane' },
    '2072704': { manufacturer: 'Cessna', model: '182T Skylane' },
    '2070104': { manufacturer: 'Cessna', model: '150' },
    '2070304': { manufacturer: 'Cessna', model: '152' },
    '2074104': { manufacturer: 'Cessna', model: '206 Stationair' },
    '2074504': { manufacturer: 'Cessna', model: '210 Centurion' },
    '2074704': { manufacturer: 'Cessna', model: '310' },
    '2075104': { manufacturer: 'Cessna', model: '208 Caravan' },
    // Piper (codes starting with 1)
    '1020605': { manufacturer: 'Piper', model: 'PA-28-161 Warrior' },
    '1020705': { manufacturer: 'Piper', model: 'PA-28-181 Archer' },
    '1020805': { manufacturer: 'Piper', model: 'PA-28-235 Cherokee' },
    '1021005': { manufacturer: 'Piper', model: 'PA-32-300 Cherokee Six' },
    '1021105': { manufacturer: 'Piper', model: 'PA-32R-301 Saratoga' },
    '1021305': { manufacturer: 'Piper', model: 'PA-34-200T Seneca' },
    '1021505': { manufacturer: 'Piper', model: 'PA-44-180 Seminole' },
    '1021705': { manufacturer: 'Piper', model: 'PA-46-310P Malibu' },
    '1020105': { manufacturer: 'Piper', model: 'PA-18 Super Cub' },
    '1020405': { manufacturer: 'Piper', model: 'PA-24 Comanche' },
    // Beechcraft (codes starting with 3)
    '3000210': { manufacturer: 'Beechcraft', model: 'A36 Bonanza' },
    '3000310': { manufacturer: 'Beechcraft', model: 'B36TC Bonanza' },
    '3000110': { manufacturer: 'Beechcraft', model: '35 Bonanza' },
    '3000410': { manufacturer: 'Beechcraft', model: '58 Baron' },
    '3000510': { manufacturer: 'Beechcraft', model: '76 Duchess' },
    '3000610': { manufacturer: 'Beechcraft', model: '90 King Air' },
    '3000710': { manufacturer: 'Beechcraft', model: '350 King Air' },
    // Cirrus (codes starting with 5)
    '5011002': { manufacturer: 'Cirrus', model: 'SR22' },
    '5011102': { manufacturer: 'Cirrus', model: 'SR22T' },
    '5010902': { manufacturer: 'Cirrus', model: 'SR20' },
    '5011202': { manufacturer: 'Cirrus', model: 'SF50 Vision Jet' },
    // Diamond
    '8000101': { manufacturer: 'Diamond', model: 'DA40 Star' },
    '8000201': { manufacturer: 'Diamond', model: 'DA42 Twin Star' },
    '8000301': { manufacturer: 'Diamond', model: 'DA62' },
    // Mooney
    '6010501': { manufacturer: 'Mooney', model: 'M20J 201' },
    '6010601': { manufacturer: 'Mooney', model: 'M20K 231' },
    '6010701': { manufacturer: 'Mooney', model: 'M20R Ovation' },
    // Grumman/American General
    '7020101': { manufacturer: 'Grumman', model: 'AA-5 Tiger' },
    '7020201': { manufacturer: 'Grumman', model: 'AA-5B Tiger' },
  };

  if (manufacturerCodes[mfrMdlCode]) {
    return manufacturerCodes[mfrMdlCode];
  }

  // If we have FAA data, try to parse manufacturer from the registration info
  if (faaData) {
    // FAA data sometimes includes manufacturer name in other fields
    const knownManufacturers = [
      'CESSNA', 'PIPER', 'BEECHCRAFT', 'BEECH', 'CIRRUS', 'MOONEY', 'DIAMOND',
      'GRUMMAN', 'AMERICAN GENERAL', 'ROCKWELL', 'BELLANCA', 'MAULE', 'VANS',
      'BOEING', 'AIRBUS', 'EMBRAER', 'BOMBARDIER', 'GULFSTREAM', 'DASSAULT'
    ];

    // Check if name field contains manufacturer info
    const nameUpper = (faaData.name || '').toUpperCase();
    for (const mfr of knownManufacturers) {
      if (nameUpper.includes(mfr)) {
        // Try to extract model from the registration
        return {
          manufacturer: mfr.charAt(0) + mfr.slice(1).toLowerCase(),
          model: 'Unknown Model',
        };
      }
    }
  }

  // Try to determine manufacturer from code prefix
  const codePrefix = mfrMdlCode.slice(0, 1);
  const prefixMap: Record<string, string> = {
    '1': 'Piper',
    '2': 'Cessna',
    '3': 'Beechcraft',
    '4': 'Bellanca',
    '5': 'Cirrus',
    '6': 'Mooney',
    '7': 'Grumman',
    '8': 'Diamond',
  };

  if (prefixMap[codePrefix]) {
    return {
      manufacturer: prefixMap[codePrefix],
      model: 'Unknown Model',
    };
  }

  return { manufacturer: 'Unknown', model: 'Unknown' };
}

function computeAirworthinessEstimates(faaData: FAARegistrationData) {
  const now = new Date();
  const airWorthDate = faaData.air_worth_date ? new Date(faaData.air_worth_date) : null;

  // Estimate inspection dates based on typical patterns
  // In production, these would come from actual logbook data
  const estimates: ScrapedAircraftData['airworthinessStatus'] = {};

  if (airWorthDate) {
    // Annual: Assume last was within 12 months (needs verification)
    const lastAnnual = new Date(now);
    lastAnnual.setMonth(now.getMonth() - 6); // Conservative estimate
    estimates.annual = lastAnnual;

    // Transponder: 24-month cycle
    const lastTransponder = new Date(now);
    lastTransponder.setMonth(now.getMonth() - 12);
    estimates.transponder = lastTransponder;

    // Altimeter/Static: 24-month cycle for IFR
    estimates.altimeter = lastTransponder;
    estimates.staticSystem = lastTransponder;

    // VOR: 30-day check (pilot responsibility)
    const lastVOR = new Date(now);
    lastVOR.setDate(now.getDate() - 15);
    estimates.vor = lastVOR;

    // ELT: 12-month inspection, 6-year battery
    const lastELT = new Date(now);
    lastELT.setMonth(now.getMonth() - 6);
    estimates.elt = lastELT;
  }

  return estimates;
}

async function fetchAIEnhancements(
  manufacturer: string,
  model: string
): Promise<{
  pohUrl?: string;
  mel?: { item: string; required: boolean; remarks?: string }[];
  operatingLimits?: ScrapedAircraftData['operatingLimits'];
}> {
  if (!isOpenRouterConfigured()) {
    return getDefaultEnhancements(manufacturer, model);
  }

  try {
    const systemPrompt = `You are an aviation data specialist. Provide accurate aircraft specifications.
Output ONLY valid JSON, no markdown formatting.`;

    const userPrompt = `For a ${manufacturer} ${model} aircraft, provide:
1. Standard MEL (Minimum Equipment List) items for VFR day flight
2. V-speeds (in KIAS)
3. Weight limits (in lbs)

Output as JSON:
{
  "mel": [{"item": "string", "required": boolean, "remarks": "optional string"}],
  "vSpeeds": {"vso": number, "vs1": number, "vr": number, "vx": number, "vy": number, "vfe": number, "va": number, "vno": number, "vne": number},
  "weights": {"maxGross": number, "empty": number, "usefulLoad": number, "fuelCapacity": number}
}`;

    const response = await generateCompletion({
      model: OPENROUTER_MODELS.PRO,
      systemPrompt,
      userPrompt,
    });

    const parsed = parseJsonResponse(response);

    return {
      mel: parsed.mel || [],
      operatingLimits: {
        vSpeeds: parsed.vSpeeds,
        weights: parsed.weights,
      },
    };
  } catch (error) {
    console.error('AI enhancement failed:', error);
    return getDefaultEnhancements(manufacturer, model);
  }
}

function getDefaultEnhancements(manufacturer: string, model: string) {
  // Default specifications for common aircraft
  const defaults: Record<string, {
    mel: { item: string; required: boolean; remarks?: string }[];
    operatingLimits: ScrapedAircraftData['operatingLimits'];
  }> = {
    '172': {
      mel: [
        { item: 'Airspeed Indicator', required: true },
        { item: 'Altimeter', required: true },
        { item: 'Magnetic Compass', required: true },
        { item: 'Tachometer', required: true },
        { item: 'Oil Pressure Gauge', required: true },
        { item: 'Temperature Gauge', required: true },
        { item: 'Fuel Quantity Indicator', required: true },
        { item: 'Landing Gear Position Indicator', required: false, remarks: 'Fixed gear - N/A' },
        { item: 'Anti-Collision Light', required: true, remarks: 'Required for flight' },
        { item: 'Position Lights', required: true, remarks: 'Night operations' },
        { item: 'Source of Electrical Energy', required: true },
        { item: 'Safety Belts', required: true },
        { item: 'ELT', required: true },
      ],
      operatingLimits: {
        vSpeeds: {
          vso: 40,
          vs1: 48,
          vr: 55,
          vx: 62,
          vy: 74,
          vfe: 85,
          va: 99,
          vno: 129,
          vne: 163,
        },
        weights: {
          maxGross: 2550,
          empty: 1691,
          usefulLoad: 859,
          fuelCapacity: 56,
        },
      },
    },
    '182': {
      mel: [
        { item: 'Airspeed Indicator', required: true },
        { item: 'Altimeter', required: true },
        { item: 'Magnetic Compass', required: true },
        { item: 'Tachometer', required: true },
        { item: 'Manifold Pressure Gauge', required: true },
        { item: 'Oil Pressure Gauge', required: true },
        { item: 'Temperature Gauge', required: true },
        { item: 'Fuel Quantity Indicator', required: true },
        { item: 'Anti-Collision Light', required: true },
        { item: 'Position Lights', required: true },
        { item: 'ELT', required: true },
      ],
      operatingLimits: {
        vSpeeds: {
          vso: 49,
          vs1: 56,
          vr: 55,
          vx: 63,
          vy: 80,
          vfe: 95,
          va: 110,
          vno: 140,
          vne: 175,
        },
        weights: {
          maxGross: 3100,
          empty: 1970,
          usefulLoad: 1130,
          fuelCapacity: 92,
        },
      },
    },
    'PA-28': {
      mel: [
        { item: 'Airspeed Indicator', required: true },
        { item: 'Altimeter', required: true },
        { item: 'Magnetic Compass', required: true },
        { item: 'Tachometer', required: true },
        { item: 'Oil Pressure Gauge', required: true },
        { item: 'Temperature Gauge', required: true },
        { item: 'Fuel Quantity Indicator', required: true },
        { item: 'Anti-Collision Light', required: true },
        { item: 'Position Lights', required: true },
        { item: 'ELT', required: true },
      ],
      operatingLimits: {
        vSpeeds: {
          vso: 50,
          vs1: 55,
          vr: 60,
          vx: 64,
          vy: 79,
          vfe: 102,
          va: 113,
          vno: 125,
          vne: 154,
        },
        weights: {
          maxGross: 2550,
          empty: 1634,
          usefulLoad: 916,
          fuelCapacity: 50,
        },
      },
    },
    'SR22': {
      mel: [
        { item: 'Airspeed Indicator', required: true },
        { item: 'Altimeter', required: true },
        { item: 'Magnetic Compass', required: true },
        { item: 'Tachometer', required: true },
        { item: 'Manifold Pressure Gauge', required: true },
        { item: 'Oil Pressure/Temp', required: true },
        { item: 'Fuel Quantity Indicator', required: true },
        { item: 'Anti-Collision Light', required: true },
        { item: 'Position Lights', required: true },
        { item: 'CAPS', required: true, remarks: 'Ballistic parachute system' },
        { item: 'PFD', required: true, remarks: 'Primary Flight Display' },
        { item: 'MFD', required: false, remarks: 'Multi-Function Display' },
        { item: 'ELT', required: true },
      ],
      operatingLimits: {
        vSpeeds: {
          vso: 60,
          vs1: 69,
          vr: 73,
          vx: 82,
          vy: 101,
          vfe: 119,
          va: 133,
          vno: 178,
          vne: 201,
        },
        weights: {
          maxGross: 3400,
          empty: 2260,
          usefulLoad: 1140,
          fuelCapacity: 92,
        },
      },
    },
  };

  // Find matching aircraft type
  const modelKey = Object.keys(defaults).find(key =>
    model.toUpperCase().includes(key.toUpperCase())
  );

  if (modelKey) {
    return defaults[modelKey];
  }

  // Generic defaults
  return {
    mel: [
      { item: 'Airspeed Indicator', required: true },
      { item: 'Altimeter', required: true },
      { item: 'Magnetic Compass', required: true },
      { item: 'Tachometer', required: true },
      { item: 'Oil Pressure Gauge', required: true },
      { item: 'Fuel Quantity Indicator', required: true },
      { item: 'Anti-Collision Light', required: true },
      { item: 'ELT', required: true },
    ],
    operatingLimits: undefined,
  };
}

async function findAircraftImage(
  tailNumber: string,
  manufacturer: string,
  model: string
): Promise<string | undefined> {
  // Try to fetch real image from PlaneSpotters/JetPhotos via Firecrawl
  try {
    const result = await fetchAircraftImageFromFirecrawl(tailNumber);
    if (result.success && result.imageUrl) {
      return result.imageUrl;
    }
  } catch (error) {
    console.warn('Failed to fetch aircraft image from Firecrawl:', error);
  }

  // Fallback to placeholder images based on manufacturer
  const placeholders: Record<string, string> = {
    'Cessna': 'https://images.unsplash.com/photo-1559128010-7c1ad6e1b6a5?w=400',
    'Piper': 'https://images.unsplash.com/photo-1540962351504-03099e0a754b?w=400',
    'Beechcraft': 'https://images.unsplash.com/photo-1436891620584-47fd0e565afb?w=400',
    'Cirrus': 'https://images.unsplash.com/photo-1583396082374-03bb8c365d3e?w=400',
  };

  return placeholders[manufacturer];
}

async function aiAircraftLookup(tailNumber: string): Promise<ScrapedAircraftData | null> {
  if (!isOpenRouterConfigured()) {
    return null;
  }

  try {
    const systemPrompt = `You are an aviation data specialist with access to FAA registration data.
Given a tail number, provide the most likely aircraft information based on common patterns.
Output ONLY valid JSON, no markdown formatting.`;

    const userPrompt = `For US aircraft registration ${tailNumber}, provide likely aircraft details:
{
  "manufacturer": "string",
  "model": "string",
  "year": number,
  "serial": "string (estimate if unknown)",
  "category": "single-engine land | multi-engine land | helicopter | etc"
}

If this appears to be an invalid N-number, return null.`;

    const response = await generateCompletion({
      model: OPENROUTER_MODELS.PRO,
      systemPrompt,
      userPrompt,
    });

    const trimmed = response.trim();
    if (trimmed.toLowerCase() === 'null') {
      return null;
    }

    const parsed = parseJsonResponse(response);

    // Get enhancements for the identified type
    const enhancements = await fetchAIEnhancements(parsed.manufacturer, parsed.model);

    return {
      tailNumber: tailNumber.toUpperCase().startsWith('N') ? tailNumber.toUpperCase() : `N${tailNumber.toUpperCase()}`,
      manufacturer: parsed.manufacturer,
      model: parsed.model,
      year: parsed.year || new Date().getFullYear(),
      serial: parsed.serial || 'PENDING-VERIFICATION',
      mel: enhancements.mel,
      operatingLimits: enhancements.operatingLimits,
      scrapedData: {
        lastScraped: new Date(),
        source: 'AI Inference',
        rawData: parsed,
      },
    };
  } catch (error) {
    console.error('AI aircraft lookup failed:', error);
    return null;
  }
}

// Export helper for checking if an N-number is valid format
export function isValidNNumber(tailNumber: string): boolean {
  // US N-numbers: N followed by 1-5 alphanumeric characters
  // First character after N must be a digit (1-9)
  // Last two characters can be letters, but not I or O
  const pattern = /^N[1-9]\d{0,4}[A-HJ-NP-Z]{0,2}$/i;
  const clean = tailNumber.toUpperCase().replace(/\s/g, '');

  if (!clean.startsWith('N')) {
    return pattern.test('N' + clean);
  }

  return pattern.test(clean);
}
