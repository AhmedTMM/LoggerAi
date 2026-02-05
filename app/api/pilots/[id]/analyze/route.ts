import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import mongoose from 'mongoose';
import Pilot from '@/lib/models/Pilot';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { generatePilotSafetyAnalysis, generatePilotSafetyAnalysisWithWeather } from '@/lib/services/safetyAnalysisService';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    await dbConnect();
    const { id } = params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid pilot ID' },
        { status: 400 }
      );
    }

    // Get weather experience from request body if provided
    let weatherExperience = null;
    try {
      const body = await request.json();
      weatherExperience = body.weatherExperience;
    } catch {
      // No body provided, that's fine
    }

    const pilot = await Pilot.findOne({ _id: id, userId });
    if (!pilot) {
      return NextResponse.json(
        { success: false, error: 'Pilot not found' },
        { status: 404 }
      );
    }

    // Get flight entries from linked documents
    const linkedDocs = await ParsedDocument.find({
      pilot: id,
      status: 'completed',
    });

    // Collect all flight entries
    const allFlightEntries: any[] = [...(pilot.flightEntries || [])];
    for (const doc of linkedDocs) {
      if (doc.entries && Array.isArray(doc.entries)) {
        allFlightEntries.push(...doc.entries);
      }
    }

    // Generate safety analysis with or without weather experience data
    let safetyAnalysis;
    if (weatherExperience && weatherExperience.flightsWithWeather >= 3) {
      // Use enhanced analysis with weather experience
      safetyAnalysis = generatePilotSafetyAnalysisWithWeather(pilot, allFlightEntries, weatherExperience);
    } else {
      // Use standard analysis
      safetyAnalysis = generatePilotSafetyAnalysis(pilot, allFlightEntries);
    }

    // Update pilot with analysis
    pilot.safetyAnalysis = safetyAnalysis;
    await pilot.save();

    return NextResponse.json({
      success: true,
      data: safetyAnalysis,
    });
  } catch (error) {
    console.error('Pilot analysis error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to analyze pilot' },
      { status: 500 }
    );
  }
}
