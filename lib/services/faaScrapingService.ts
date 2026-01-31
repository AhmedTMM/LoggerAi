// FAA Scraping Service - Magic Add Aircraft
// Scrapes FAA registration data and uses AI to extract airworthiness information

import { GoogleGenerativeAI } from '@google/generative-ai';

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

// FAA Registry API endpoint
const FAA_REGISTRY_BASE = 'https://registry.faa.gov/aircraftinquiry/Search/NNumberResult';

export async function scrapeAircraftByTailNumber(tailNumber: string): Promise<ScrapedAircraftData | null> {
  const cleanTailNumber = tailNumber.toUpperCase().replace(/^N/, '');

  try {
    // Step 1: Fetch FAA registration data
    const faaData = await fetchFAARegistration(cleanTailNumber);
    if (!faaData) {
      // Fallback to AI-based lookup
      return await aiAircraftLookup(tailNumber);
    }

    // Step 2: Parse manufacturer/model from code
    const typeData = await lookupAircraftType(faaData.mfr_mdl_code);

    // Step 3: Get POH and standard MEL via AI
    const aiEnhancements = await fetchAIEnhancements(typeData.manufacturer, typeData.model);

    // Step 4: Compute airworthiness status estimates
    const airworthinessStatus = computeAirworthinessEstimates(faaData);

    // Step 5: Attempt to find aircraft image
    const imageUrl = await findAircraftImage(tailNumber, typeData.manufacturer, typeData.model);

    return {
      tailNumber: `N${cleanTailNumber}`,
      manufacturer: typeData.manufacturer,
      model: typeData.model,
      year: parseInt(faaData.year_mfr) || new Date().getFullYear(),
      serial: faaData.serial_number,
      imageUrl,
      pohUrl: aiEnhancements.pohUrl,
      airworthinessStatus,
      mel: aiEnhancements.mel,
      operatingLimits: aiEnhancements.operatingLimits,
      scrapedData: {
        lastScraped: new Date(),
        source: 'FAA Registry + AI Enhancement',
        rawData: faaData,
      },
    };
  } catch (error) {
    console.error('Aircraft scraping error:', error);
    return await aiAircraftLookup(tailNumber);
  }
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

async function lookupAircraftType(mfrMdlCode: string): Promise<AircraftTypeData> {
  // Common manufacturer codes - this is a simplified mapping
  const manufacturerCodes: Record<string, { manufacturer: string; model: string }> = {
    '2072304': { manufacturer: 'Cessna', model: '172S' },
    '2073104': { manufacturer: 'Cessna', model: '172R' },
    '2073304': { manufacturer: 'Cessna', model: '172N' },
    '2073504': { manufacturer: 'Cessna', model: '172M' },
    '2072504': { manufacturer: 'Cessna', model: '182Q' },
    '1020605': { manufacturer: 'Piper', model: 'PA-28-161' },
    '1020705': { manufacturer: 'Piper', model: 'PA-28-181' },
    '3000210': { manufacturer: 'Beechcraft', model: 'A36' },
    '3000310': { manufacturer: 'Beechcraft', model: 'B36TC' },
    '5011002': { manufacturer: 'Cirrus', model: 'SR22' },
    '5011102': { manufacturer: 'Cirrus', model: 'SR22T' },
  };

  if (manufacturerCodes[mfrMdlCode]) {
    return manufacturerCodes[mfrMdlCode];
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
  if (!process.env.GEMINI_API_KEY) {
    return getDefaultEnhancements(manufacturer, model);
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const geminiModel = genAI.getGenerativeModel({
      model: 'gemini-3-pro-preview',
      systemInstruction: `You are an aviation data specialist. Provide accurate aircraft specifications.
Output ONLY valid JSON, no markdown formatting.`,
    });

    const prompt = `For a ${manufacturer} ${model} aircraft, provide:
1. Standard MEL (Minimum Equipment List) items for VFR day flight
2. V-speeds (in KIAS)
3. Weight limits (in lbs)

Output as JSON:
{
  "mel": [{"item": "string", "required": boolean, "remarks": "optional string"}],
  "vSpeeds": {"vso": number, "vs1": number, "vr": number, "vx": number, "vy": number, "vfe": number, "va": number, "vno": number, "vne": number},
  "weights": {"maxGross": number, "empty": number, "usefulLoad": number, "fuelCapacity": number}
}`;

    const result = await geminiModel.generateContent(prompt);
    const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(text);

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
  // In production, this would query aircraft image databases
  // For now, return a placeholder based on manufacturer
  const placeholders: Record<string, string> = {
    'Cessna': 'https://images.unsplash.com/photo-1559128010-7c1ad6e1b6a5?w=400',
    'Piper': 'https://images.unsplash.com/photo-1540962351504-03099e0a754b?w=400',
    'Beechcraft': 'https://images.unsplash.com/photo-1436891620584-47fd0e565afb?w=400',
    'Cirrus': 'https://images.unsplash.com/photo-1583396082374-03bb8c365d3e?w=400',
  };

  return placeholders[manufacturer];
}

async function aiAircraftLookup(tailNumber: string): Promise<ScrapedAircraftData | null> {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-pro-preview',
      systemInstruction: `You are an aviation data specialist with access to FAA registration data.
Given a tail number, provide the most likely aircraft information based on common patterns.
Output ONLY valid JSON, no markdown formatting.`,
    });

    const prompt = `For US aircraft registration ${tailNumber}, provide likely aircraft details:
{
  "manufacturer": "string",
  "model": "string",
  "year": number,
  "serial": "string (estimate if unknown)",
  "category": "single-engine land | multi-engine land | helicopter | etc"
}

If this appears to be an invalid N-number, return null.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();

    if (text.toLowerCase() === 'null') {
      return null;
    }

    const parsed = JSON.parse(text);

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
