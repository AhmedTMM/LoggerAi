import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { requireAuth } from '@/lib/auth-helpers';

/**
 * Update logbook entries with weather data
 * Called from frontend after fetching historical weather
 */
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
        { success: false, error: 'Invalid document ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { weatherData } = body; // Map of entry index to weather data

    if (!weatherData || typeof weatherData !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid weather data' },
        { status: 400 }
      );
    }

    // Get document
    const document = await ParsedDocument.findOne({ _id: id, userId });
    if (!document) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    if (!document.entries || !Array.isArray(document.entries)) {
      return NextResponse.json(
        { success: false, error: 'Document has no entries' },
        { status: 400 }
      );
    }

    // Update entries with weather data
    let updateCount = 0;
    for (const [indexStr, weather] of Object.entries(weatherData)) {
      const index = parseInt(indexStr);
      if (index >= 0 && index < document.entries.length && weather) {
        // Only update if entry doesn't already have weather
        if (!document.entries[index].weather) {
          document.entries[index].weather = weather;
          updateCount++;
        }
      }
    }

    // Save document
    await document.save();

    console.log(`[EnrichWeather] Updated ${updateCount} entries with weather data for document ${id}`);

    return NextResponse.json({
      success: true,
      updatedCount: updateCount,
    });
  } catch (error) {
    console.error('Enrich weather error:', error);
    return NextResponse.json(
      { success: false, error: 'An internal error occurred while enriching weather data' },
      { status: 500 }
    );
  }
}
