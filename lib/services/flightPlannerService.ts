// Flight Planner Parsing Service
// Parses flight planner photos (PaperlessFBO, ForeFlight screenshots, etc.) using Reducto + AI

import { Reducto, toFile } from 'reductoai';
import {
  isOpenRouterConfigured,
  generateCompletion,
  generateVisionCompletion,
  parseJsonResponse,
  OPENROUTER_MODELS,
} from './openRouterClient';
import { IFlightPlannerData } from '../models/Flight';

interface ParsedFlightPlan {
  source: 'paperlessfbo' | 'foreflight' | 'garmin' | 'manual' | 'photo_upload';
  parsedData: {
    pilotName?: string;
    aircraftTail?: string;
    date?: string;
    departureTime?: string;
    arrivalTime?: string;
    departureAirport?: string;
    arrivalAirport?: string;
    route?: string;
    fuelOnBoard?: number;
    passengers?: number;
    remarks?: string;
    grossWeight?: number;
    cg?: number;
    flightType?: 'local' | 'cross_country' | 'training' | 'checkride';
    estimatedDuration?: number;
    alternateAirport?: string;
  };
  rawText: string;
  confidence: number;
}

const FLIGHT_PLANNER_EXTRACTION_PROMPT = `You are an expert at parsing aviation flight planning documents and screenshots.

Extract ALL flight planning information from this image. This could be from:
- PaperlessFBO dispatch/schedule screen
- ForeFlight flight plan
- Garmin Pilot app
- FBO scheduling system
- Handwritten flight plan form
- FAA Flight Plan form

EXTRACT THE FOLLOWING (include only fields that are visible):

PILOT INFORMATION:
- pilotName: Full name of the pilot in command

AIRCRAFT:
- aircraftTail: N-number or registration (e.g., N12345, N5392R)

SCHEDULING:
- date: Flight date (format as YYYY-MM-DD)
- departureTime: Scheduled departure time (format as HH:MM in 24hr or note AM/PM)
- arrivalTime: Expected arrival time (format as HH:MM)
- estimatedDuration: Total flight time in hours (decimal, e.g., 1.5)

ROUTE:
- departureAirport: Departure airport (4-letter ICAO code preferred, e.g., KJFK)
- arrivalAirport: Destination airport (ICAO code)
- alternateAirport: Alternate airport if listed
- route: Full route of flight or waypoints

FLIGHT DETAILS:
- flightType: One of: "local", "cross_country", "training", "checkride"
- fuelOnBoard: Fuel in gallons
- passengers: Number of passengers (excluding pilot)
- remarks: Any remarks, notes, or special instructions

WEIGHT & BALANCE (if visible):
- grossWeight: Takeoff gross weight in lbs
- cg: Center of gravity position

OUTPUT FORMAT:
Return a valid JSON object with ONLY the fields that have values. Do not include fields with null or empty values.
Do not include markdown formatting. Just the raw JSON object.

Example output:
{
  "pilotName": "John Smith",
  "aircraftTail": "N5392R",
  "date": "2024-01-15",
  "departureTime": "14:30",
  "departureAirport": "KJFK",
  "arrivalAirport": "KBOS",
  "flightType": "cross_country",
  "estimatedDuration": 2.5,
  "fuelOnBoard": 48,
  "remarks": "VFR flight plan filed"
}`;

// Parse flight planner image using Reducto for OCR and AI for structured extraction
export async function parseFlightPlannerImage(
  imageBase64: string,
  imageType: 'png' | 'jpg' | 'jpeg' | 'pdf' = 'png'
): Promise<ParsedFlightPlan> {
  let rawText = '';
  let parsedData: ParsedFlightPlan['parsedData'] = {};
  let confidence = 0;

  // First, try direct AI vision analysis (faster for simple images)
  try {
    const visionResult = await parseWithAIVision(imageBase64, imageType);
    if (visionResult && visionResult.confidence > 0.5) {
      return visionResult;
    }
  } catch (err) {
    console.log('AI vision failed, falling back to Reducto:', err);
  }

  // Fallback to Reducto for complex documents
  try {
    const reductoResult = await parseWithReducto(imageBase64, imageType);
    rawText = reductoResult.rawText;

    // Use AI to structure the OCR text
    if (rawText) {
      const structuredResult = await structureTextWithAI(rawText);
      parsedData = structuredResult.parsedData;
      confidence = structuredResult.confidence;
    }
  } catch (err) {
    console.error('Reducto parsing failed:', err);
  }

  // Detect source based on content patterns
  const source = detectSource(rawText, parsedData);

  return {
    source,
    parsedData,
    rawText,
    confidence,
  };
}

// Parse directly with AI Vision (for images)
async function parseWithAIVision(
  imageBase64: string,
  imageType: string
): Promise<ParsedFlightPlan | null> {
  if (!isOpenRouterConfigured()) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const mimeType = imageType === 'pdf' ? 'application/pdf' : `image/${imageType}`;

  const response = await generateVisionCompletion({
    model: OPENROUTER_MODELS.FAST,
    userPrompt: FLIGHT_PLANNER_EXTRACTION_PROMPT,
    imageBase64,
    mimeType: mimeType as any,
  });

  try {
    const parsedData = parseJsonResponse(response);

    // Calculate confidence based on how many fields were extracted
    const fieldCount = Object.keys(parsedData).length;
    const confidence = Math.min(fieldCount / 8, 1); // 8 key fields = 100%

    const source = detectSource('', parsedData);

    return {
      source,
      parsedData,
      rawText: response,
      confidence,
    };
  } catch (err) {
    console.error('Failed to parse AI response:', response);
    return null;
  }
}

// Parse with Reducto for complex PDFs or handwritten documents
async function parseWithReducto(
  imageBase64: string,
  imageType: string
): Promise<{ rawText: string; structured: any }> {
  const apiKey = process.env.REDUCTO_API_KEY;
  if (!apiKey) {
    throw new Error('REDUCTO_API_KEY not configured');
  }

  const client = new Reducto({ apiKey });

  // Upload file
  const buffer = Buffer.from(imageBase64, 'base64');
  const extension = imageType === 'jpg' ? 'jpeg' : imageType;
  const filename = `flightplan.${extension}`;

  const upload = await client.upload({
    file: await toFile(buffer, filename),
    extension: extension as any,
  });

  // Extract with custom prompt
  const extraction = await client.extract.run({
    input: upload,
    instructions: {
      system_prompt: FLIGHT_PLANNER_EXTRACTION_PROMPT,
    },
    settings: {
      optimize_for_latency: true,
    },
  });

  const result = (extraction as any).result || [];
  const rawText = result.map((r: any) => JSON.stringify(r)).join('\n');

  return {
    rawText,
    structured: result[0] || {},
  };
}

// Structure raw OCR text into flight plan fields using AI
async function structureTextWithAI(
  rawText: string
): Promise<{ parsedData: ParsedFlightPlan['parsedData']; confidence: number }> {
  if (!isOpenRouterConfigured()) {
    return { parsedData: {}, confidence: 0 };
  }

  const response = await generateCompletion({
    model: OPENROUTER_MODELS.FAST,
    systemPrompt: FLIGHT_PLANNER_EXTRACTION_PROMPT,
    userPrompt: `Parse this OCR text from a flight planning document and extract structured data:\n\n${rawText}`,
  });

  try {
    const parsedData = parseJsonResponse(response);

    const fieldCount = Object.keys(parsedData).length;
    const confidence = Math.min(fieldCount / 8, 1);

    return { parsedData, confidence };
  } catch (err) {
    return { parsedData: {}, confidence: 0 };
  }
}

// Detect the source system based on content patterns
function detectSource(
  rawText: string,
  parsedData: any
): ParsedFlightPlan['source'] {
  const text = rawText.toLowerCase();

  if (text.includes('paperless') || text.includes('fbo')) {
    return 'paperlessfbo';
  }
  if (text.includes('foreflight') || text.includes('fore flight')) {
    return 'foreflight';
  }
  if (text.includes('garmin') || text.includes('pilot app')) {
    return 'garmin';
  }

  // Check for handwritten patterns (lower confidence usually)
  return 'photo_upload';
}

// Create a flight from parsed planner data
export function createFlightFromPlannerData(
  plannerData: ParsedFlightPlan,
  pilotId: string,
  aircraftId: string
): {
  pilot: string;
  aircraft: string;
  scheduledDate: Date;
  scheduledTime?: string;
  departureAirport: string;
  arrivalAirport?: string;
  alternateAirport?: string;
  route?: string;
  estimatedDuration?: number;
  notes?: string;
  flightPlannerData: IFlightPlannerData;
} {
  const pd = plannerData.parsedData;

  // Parse date
  let scheduledDate = new Date();
  if (pd.date) {
    const parsed = new Date(pd.date);
    if (!isNaN(parsed.getTime())) {
      scheduledDate = parsed;
    }
  }

  // Combine notes
  const notes = [pd.remarks, pd.passengers ? `${pd.passengers} passengers` : null]
    .filter(Boolean)
    .join('. ');

  return {
    pilot: pilotId,
    aircraft: aircraftId,
    scheduledDate,
    scheduledTime: pd.departureTime,
    departureAirport: pd.departureAirport?.toUpperCase() || 'UNKN',
    arrivalAirport: pd.arrivalAirport?.toUpperCase(),
    alternateAirport: pd.alternateAirport?.toUpperCase(),
    route: pd.route,
    estimatedDuration: pd.estimatedDuration,
    notes,
    flightPlannerData: {
      source: plannerData.source,
      uploadedAt: new Date(),
      parsedData: pd,
      rawText: plannerData.rawText,
      confidence: plannerData.confidence,
    },
  };
}

// Match parsed pilot name to existing pilots
export async function matchPilotByName(
  pilotName: string,
  PilotModel: any
): Promise<string | null> {
  if (!pilotName) return null;

  // Try exact match first
  let pilot = await PilotModel.findOne({
    name: { $regex: new RegExp(`^${pilotName}$`, 'i') },
  });

  if (pilot) return pilot._id.toString();

  // Try partial match
  const nameParts = pilotName.split(' ');
  if (nameParts.length >= 2) {
    pilot = await PilotModel.findOne({
      $or: [
        { name: { $regex: new RegExp(nameParts[0], 'i') } },
        { name: { $regex: new RegExp(nameParts[nameParts.length - 1], 'i') } },
      ],
    });
    if (pilot) return pilot._id.toString();
  }

  return null;
}

// Match parsed tail number to existing aircraft
export async function matchAircraftByTail(
  tailNumber: string,
  AircraftModel: any
): Promise<string | null> {
  if (!tailNumber) return null;

  // Normalize tail number
  const normalizedTail = tailNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const aircraft = await AircraftModel.findOne({
    tailNumber: { $regex: new RegExp(`^${normalizedTail}$`, 'i') },
  });

  return aircraft ? aircraft._id.toString() : null;
}

// Validate flight plan data for safety analysis
export function validatePlannerData(
  plannerData: ParsedFlightPlan
): {
  valid: boolean;
  missingFields: string[];
  warnings: string[];
} {
  const missing: string[] = [];
  const warnings: string[] = [];

  const pd = plannerData.parsedData;

  // Required fields
  if (!pd.departureAirport) missing.push('Departure airport');
  if (!pd.date && !pd.departureTime) missing.push('Date or time');

  // Recommended fields
  if (!pd.pilotName) warnings.push('Pilot name not detected');
  if (!pd.aircraftTail) warnings.push('Aircraft tail number not detected');
  if (!pd.fuelOnBoard) warnings.push('Fuel quantity not detected');

  // Cross-country specific
  if (pd.arrivalAirport && pd.arrivalAirport !== pd.departureAirport) {
    if (!pd.alternateAirport) {
      warnings.push('Cross-country flight without alternate airport');
    }
    if (!pd.estimatedDuration) {
      warnings.push('Cross-country flight without estimated duration');
    }
  }

  return {
    valid: missing.length === 0,
    missingFields: missing,
    warnings,
  };
}
