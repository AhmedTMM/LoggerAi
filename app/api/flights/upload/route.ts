import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Flight from '@/lib/models/Flight';
import Pilot from '@/lib/models/Pilot';
import Aircraft from '@/lib/models/Aircraft';
import {
  parseFlightPlannerImage,
  matchPilotByName,
  matchAircraftByTail,
  createFlightFromPlannerData,
  validatePlannerData,
} from '@/lib/services/flightPlannerService';
import { runComprehensiveSafetyAnalysis } from '@/lib/services/comprehensiveSafetyService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for AI parsing

// POST /api/flights/upload - Upload flight planner photo and create flight
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const pilotIdOverride = formData.get('pilotId') as string | null;
    const aircraftIdOverride = formData.get('aircraftId') as string | null;
    const autoCreate = formData.get('autoCreate') !== 'false'; // Default true
    const runAnalysis = formData.get('runAnalysis') !== 'false'; // Default true

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Supported: PNG, JPG, PDF' },
        { status: 400 }
      );
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // Determine image type
    let imageType: 'png' | 'jpg' | 'jpeg' | 'pdf' = 'png';
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      imageType = 'jpg';
    } else if (file.type === 'application/pdf') {
      imageType = 'pdf';
    }

    // Parse the flight planner image
    const parsedData = await parseFlightPlannerImage(base64, imageType);

    // Validate parsed data
    const validation = validatePlannerData(parsedData);

    // Try to match pilot and aircraft
    let pilotId = pilotIdOverride;
    let aircraftId = aircraftIdOverride;
    let pilotMatched = !!pilotIdOverride;
    let aircraftMatched = !!aircraftIdOverride;

    if (!pilotId && parsedData.parsedData.pilotName) {
      const matchedPilotId = await matchPilotByName(parsedData.parsedData.pilotName, Pilot);
      if (matchedPilotId) {
        pilotId = matchedPilotId;
        pilotMatched = true;
      }
    }

    if (!aircraftId && parsedData.parsedData.aircraftTail) {
      const matchedAircraftId = await matchAircraftByTail(parsedData.parsedData.aircraftTail, Aircraft);
      if (matchedAircraftId) {
        aircraftId = matchedAircraftId;
        aircraftMatched = true;
      }
    }

    // If autoCreate is false or we're missing required matches, return parsed data only
    if (!autoCreate || !pilotId || !aircraftId) {
      // Get available pilots and aircraft for selection
      const [pilots, aircraftList] = await Promise.all([
        Pilot.find({}, 'name email').lean(),
        Aircraft.find({}, 'tailNumber model').lean(),
      ]);

      return NextResponse.json({
        success: true,
        parsed: true,
        created: false,
        data: {
          parsedData: parsedData.parsedData,
          source: parsedData.source,
          confidence: parsedData.confidence,
          validation,
          matches: {
            pilot: pilotMatched
              ? { id: pilotId, name: parsedData.parsedData.pilotName }
              : null,
            aircraft: aircraftMatched
              ? { id: aircraftId, tail: parsedData.parsedData.aircraftTail }
              : null,
          },
          availablePilots: pilots,
          availableAircraft: aircraftList,
        },
      });
    }

    // Create the flight
    const flightData = createFlightFromPlannerData(parsedData, pilotId, aircraftId);

    // Store the image URL (you could upload to S3/Cloudinary here)
    flightData.flightPlannerData.imageUrl = `data:${file.type};base64,${base64.substring(0, 100)}...`; // Truncated for storage

    const flight = new Flight({
      ...flightData,
      status: 'planned',
      overallStatus: 'no-go', // Will be updated by analysis
    });

    await flight.save();

    // Run comprehensive safety analysis
    let safetyAnalysis = null;
    if (runAnalysis) {
      try {
        safetyAnalysis = await runComprehensiveSafetyAnalysis(flight._id.toString());
      } catch (analysisError) {
        console.error('Safety analysis failed:', analysisError);
      }
    }

    // Fetch the populated flight
    const populatedFlight = await Flight.findById(flight._id)
      .populate('pilot', 'name email certificates experience')
      .populate('aircraft', 'tailNumber model maintenanceDates currentHours operatingLimits');

    return NextResponse.json({
      success: true,
      parsed: true,
      created: true,
      data: {
        flight: populatedFlight,
        parsedData: parsedData.parsedData,
        source: parsedData.source,
        confidence: parsedData.confidence,
        validation,
        safetyAnalysis,
      },
    });
  } catch (error) {
    console.error('Flight planner upload error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// GET /api/flights/upload - Get upload instructions
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      supportedFormats: ['PNG', 'JPG', 'JPEG', 'PDF'],
      supportedSources: [
        'PaperlessFBO screenshots',
        'ForeFlight flight plans',
        'Garmin Pilot exports',
        'FAA Flight Plan forms',
        'Handwritten flight plans',
      ],
      maxFileSize: '10MB',
      parameters: {
        file: 'Required - The flight planner image or PDF',
        pilotId: 'Optional - Override pilot ID if known',
        aircraftId: 'Optional - Override aircraft ID if known',
        autoCreate: 'Optional - Set to "false" to only parse without creating flight',
        runAnalysis: 'Optional - Set to "false" to skip safety analysis',
      },
    },
  });
}
