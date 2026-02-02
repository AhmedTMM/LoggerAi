import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Flight from '@/lib/models/Flight';
import Pilot from '@/lib/models/Pilot';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { generateFlightSafetyAnalysis } from '@/lib/services/safetyAnalysisService';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbConnect();
    const { id } = params;

    const flight = await Flight.findById(id).populate('pilot');
    if (!flight) {
      return NextResponse.json(
        { success: false, error: 'Flight not found' },
        { status: 404 }
      );
    }

    if (!flight.pilot) {
      return NextResponse.json(
        { success: false, error: 'Flight has no assigned pilot' },
        { status: 400 }
      );
    }

    // Get pilot's flight entries from logbooks for weather experience analysis
    const linkedDocs = await ParsedDocument.find({
      pilot: flight.pilot._id,
      status: 'completed',
      documentType: { $in: ['pilot_logbook', 'logbook'] },
    });

    const flightEntries: any[] = [];
    for (const doc of linkedDocs) {
      if (doc.entries && Array.isArray(doc.entries)) {
        flightEntries.push(...doc.entries);
      }
    }

    // Use departure weather for analysis
    const weather = flight.departureWeather;
    if (!weather || !weather.flightCategory) {
      return NextResponse.json(
        { success: false, error: 'Flight has no weather data' },
        { status: 400 }
      );
    }

    // Generate flight-specific safety analysis
    const safetyAnalysis = generateFlightSafetyAnalysis(
      flight.pilot,
      weather,
      flightEntries
    );

    // Update flight with analysis snapshot
    flight.safetyAnalysisSnapshot = safetyAnalysis;
    await flight.save();

    return NextResponse.json({
      success: true,
      data: safetyAnalysis,
    });
  } catch (error) {
    console.error('Flight safety analysis error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
