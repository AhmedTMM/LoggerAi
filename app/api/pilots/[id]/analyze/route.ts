import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Pilot from '@/lib/models/Pilot';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { generatePilotSafetyAnalysis } from '@/lib/services/safetyAnalysisService';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbConnect();
    const { id } = params;

    const pilot = await Pilot.findById(id);
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

    // Generate safety analysis
    const safetyAnalysis = generatePilotSafetyAnalysis(pilot, allFlightEntries);

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
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
