import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Aircraft from '@/lib/models/Aircraft';
import { aircraftRequiresMEL } from '@/lib/services/av1onicsService';
import { requireAuth } from '@/lib/auth-helpers';

/**
 * Scrape FAA Registry for aircraft information by tail number
 */
async function scrapeFAARegistry(tailNumber: string): Promise<any> {
  // Clean tail number (remove N if present for lookup)
  const cleanTail = tailNumber.toUpperCase().replace(/^N/, '');

  try {
    // FAA Registry Inquiry URL
    const url = `https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?nNumberTxt=${cleanTail}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error('FAA Registry request failed');
    }

    const html = await response.text();

    // Parse HTML to extract aircraft data
    const data = parseFAAHtml(html);

    return data;
  } catch (error) {
    console.error('FAA scraping error:', error);
    return null;
  }
}

/**
 * Parse FAA Registry HTML response
 */
function parseFAAHtml(html: string): any {
  // Basic HTML parsing to extract aircraft data
  const data: any = {};

  // Helper to extract text between labels
  const extractField = (label: string): string | null => {
    const regex = new RegExp(`${label}[:\\s]*<[^>]*>([^<]+)<`, 'i');
    const match = html.match(regex);
    return match ? match[1].trim() : null;
  };

  // Alternative: Look for table data patterns
  const extractTableField = (fieldName: string): string | null => {
    const patterns = [
      new RegExp(`<td[^>]*>${fieldName}</td>[^<]*<td[^>]*>([^<]+)</td>`, 'i'),
      new RegExp(`<th[^>]*>${fieldName}</th>[^<]*<td[^>]*>([^<]+)</td>`, 'i'),
      new RegExp(`${fieldName}[^<]*</[^>]+>[^<]*<[^>]+>([^<]+)<`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return match[1].trim();
    }
    return null;
  };

  // Extract common fields
  data.registrationNumber = extractTableField('N-Number') || extractField('N-Number');
  data.serialNumber = extractTableField('Serial Number') || extractField('Serial Number');
  data.manufacturer = extractTableField('Manufacturer') || extractField('Manufacturer');
  data.model = extractTableField('Model') || extractField('Model');
  data.yearMfr = extractTableField('Year Manufactured') || extractField('Year Manufactured');
  data.typeAircraft = extractTableField('Type Aircraft') || extractField('Type Aircraft');
  data.typeEngine = extractTableField('Type Engine') || extractField('Type Engine');
  data.certification = extractTableField('Certificate Issue Date') || extractField('Certificate');
  data.airWorthDate = extractTableField('Airworthiness Date') || extractField('Airworthiness');
  data.expirationDate = extractTableField('Expiration Date') || extractField('Expiration');

  // Owner information
  data.ownerName = extractTableField('Name') || extractField('Owner');
  data.ownerCity = extractTableField('City') || extractField('City');
  data.ownerState = extractTableField('State') || extractField('State');

  // Engine info
  data.engineMfr = extractTableField('Engine Manufacturer') || extractField('Engine Mfr');
  data.engineModel = extractTableField('Engine Model');

  return data;
}

/**
 * Look up aircraft specs from known database
 */
function lookupAircraftSpecs(manufacturer: string, model: string): any {
  // Common aircraft specifications database
  const specs: Record<string, any> = {
    // Cessna
    'CESSNA_172': {
      vSpeeds: { vso: 40, vs1: 48, vr: 55, vx: 62, vy: 74, vfe: 85, va: 99, vno: 129, vne: 163 },
      weights: { maxGross: 2550, empty: 1680, usefulLoad: 870, fuelCapacity: 56 },
      performance: { takeoffDistanceGround: 945, rateOfClimb: 730, serviceCeiling: 14000 },
    },
    'CESSNA_182': {
      vSpeeds: { vso: 49, vs1: 56, vr: 55, vx: 63, vy: 80, vfe: 95, va: 111, vno: 140, vne: 176 },
      weights: { maxGross: 3100, empty: 1970, usefulLoad: 1130, fuelCapacity: 92 },
      performance: { takeoffDistanceGround: 795, rateOfClimb: 924, serviceCeiling: 18100 },
    },
    'CESSNA_152': {
      vSpeeds: { vso: 35, vs1: 43, vr: 50, vx: 55, vy: 67, vfe: 85, va: 98, vno: 111, vne: 149 },
      weights: { maxGross: 1670, empty: 1081, usefulLoad: 589, fuelCapacity: 26 },
      performance: { takeoffDistanceGround: 725, rateOfClimb: 715, serviceCeiling: 14700 },
    },
    // Piper
    'PIPER_PA-28': {
      vSpeeds: { vso: 50, vs1: 55, vr: 60, vx: 64, vy: 79, vfe: 103, va: 113, vno: 125, vne: 154 },
      weights: { maxGross: 2440, empty: 1438, usefulLoad: 1002, fuelCapacity: 50 },
      performance: { takeoffDistanceGround: 1000, rateOfClimb: 660, serviceCeiling: 11000 },
    },
    // Beechcraft
    'BEECH_A36': {
      vSpeeds: { vso: 57, vs1: 64, vr: 70, vx: 83, vy: 100, vfe: 113, va: 130, vno: 167, vne: 196 },
      weights: { maxGross: 3650, empty: 2495, usefulLoad: 1155, fuelCapacity: 74 },
      performance: { takeoffDistanceGround: 1020, rateOfClimb: 1030, serviceCeiling: 18500 },
    },
    // Cirrus
    'CIRRUS_SR22': {
      vSpeeds: { vso: 60, vs1: 70, vr: 73, vx: 78, vy: 101, vfe: 119, va: 133, vno: 178, vne: 201 },
      weights: { maxGross: 3400, empty: 2250, usefulLoad: 1150, fuelCapacity: 92 },
      performance: { takeoffDistanceGround: 1028, rateOfClimb: 1270, serviceCeiling: 17500 },
    },
  };

  // Normalize manufacturer and model for lookup
  const mfrUpper = (manufacturer || '').toUpperCase();
  const modelUpper = (model || '').toUpperCase();

  // Try to match
  for (const [key, value] of Object.entries(specs)) {
    const [specMfr, specModel] = key.split('_');
    if (mfrUpper.includes(specMfr) && modelUpper.includes(specModel)) {
      return value;
    }
  }

  // Try partial matches
  if (mfrUpper.includes('CESSNA')) {
    if (modelUpper.includes('172')) return specs['CESSNA_172'];
    if (modelUpper.includes('182')) return specs['CESSNA_182'];
    if (modelUpper.includes('152')) return specs['CESSNA_152'];
  }
  if (mfrUpper.includes('PIPER') && modelUpper.includes('28')) return specs['PIPER_PA-28'];
  if (mfrUpper.includes('BEECH') && modelUpper.includes('36')) return specs['BEECH_A36'];
  if (mfrUpper.includes('CIRRUS') && modelUpper.includes('22')) return specs['CIRRUS_SR22'];

  return null;
}

/**
 * POST /api/aircraft/add-by-tail
 * Add aircraft by tail number only - scrapes FAA registry for details
 */
export async function POST(request: NextRequest) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    await connectDB();

    const body = await request.json();
    const { tailNumber } = body;

    if (!tailNumber) {
      return NextResponse.json(
        { success: false, error: 'Tail number is required' },
        { status: 400 }
      );
    }

    // Normalize tail number
    const normalizedTail = tailNumber.toUpperCase().trim();

    // Check if aircraft already exists
    const existing = await Aircraft.findOne({ tailNumber: normalizedTail, userId });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Aircraft already exists', aircraft: existing },
        { status: 409 }
      );
    }

    // Scrape FAA Registry
    const faaData = await scrapeFAARegistry(normalizedTail);

    // Extract basic info
    const manufacturer = faaData?.manufacturer || 'Unknown';
    const model = faaData?.model || 'Unknown';
    const year = parseInt(faaData?.yearMfr) || new Date().getFullYear();
    const serial = faaData?.serialNumber || '';

    // Look up aircraft specs
    const specs = lookupAircraftSpecs(manufacturer, model);

    // Check if MEL is required
    const requiresMEL = aircraftRequiresMEL(model, manufacturer);

    // Set default maintenance dates (current for new aircraft)
    const today = new Date();
    const oneYearFromNow = new Date(today);
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    const twoYearsFromNow = new Date(today);
    twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);

    // Create aircraft
    const aircraft = new Aircraft({
      userId,
      tailNumber: normalizedTail,
      manufacturer,
      model,
      year,
      serial,
      // Set default maintenance dates
      maintenanceDates: {
        annual: oneYearFromNow,
        transponder: twoYearsFromNow,
        staticSystem: twoYearsFromNow,
      },
      // Airworthiness status
      airworthinessStatus: {
        annual: oneYearFromNow,
        transponder: twoYearsFromNow,
        staticSystem: twoYearsFromNow,
        altimeter: twoYearsFromNow,
        elt: oneYearFromNow,
      },
      // Current hours (to be updated)
      currentHours: {
        hobbs: 0,
        tach: 0,
      },
      // Operating limits from specs
      operatingLimits: specs ? {
        vSpeeds: specs.vSpeeds,
        weights: specs.weights,
      } : undefined,
      // POH data
      pohData: specs ? {
        source: 'scraped',
        scrapedAt: new Date(),
        performance: specs.performance,
      } : undefined,
      // MEL configuration
      melConfig: {
        requiresMEL,
        melDocumentId: undefined,
        koelApplicable: false,
        items: [],
      },
      // FAA scraped data
      scrapedData: {
        lastScraped: new Date(),
        source: 'faa_registry',
        faaRegistration: {
          registrationNumber: normalizedTail,
          serialNumber: serial,
          yearMfr: year,
          typeAircraft: faaData?.typeAircraft,
          typeEngine: faaData?.typeEngine,
          certification: faaData?.certification,
          airWorthDate: faaData?.airWorthDate,
          expirationDate: faaData?.expirationDate,
          name: faaData?.ownerName,
          city: faaData?.ownerCity,
          state: faaData?.ownerState,
        },
      },
      // Owner info from FAA
      owner: faaData?.ownerName ? {
        name: faaData.ownerName,
      } : undefined,
      // Empty logbooks
      logs: [],
      logbooks: {
        engine: [],
        airframe: [],
        propeller: [],
        avionics: [],
      },
    });

    await aircraft.save();

    return NextResponse.json({
      success: true,
      aircraft,
      faaData,
      specs: specs ? true : false,
      message: `Aircraft ${normalizedTail} added successfully${specs ? ' with specs from database' : ''}`,
    });
  } catch (error) {
    console.error('Add aircraft error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add aircraft' },
      { status: 500 }
    );
  }
}
