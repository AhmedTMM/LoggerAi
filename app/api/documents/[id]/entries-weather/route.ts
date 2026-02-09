import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { requireAuth } from '@/lib/auth-helpers';
import mongoose from 'mongoose';

/**
 * PATCH /api/documents/[id]/entries-weather
 *
 * Saves historical weather data onto individual document entries.
 * Accepts { weatherByIndex: Record<number, object> } where keys are entry indices.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid document ID' },
        { status: 400 }
      );
    }

    const { weatherByIndex } = await request.json();
    if (!weatherByIndex || typeof weatherByIndex !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Missing weatherByIndex object' },
        { status: 400 }
      );
    }

    await dbConnect();

    const doc = await ParsedDocument.findOne({ _id: id, userId });
    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    if (!doc.entries || doc.entries.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Document has no entries' },
        { status: 400 }
      );
    }

    // Apply weather to entries by index
    let updated = 0;
    for (const [idxStr, weather] of Object.entries(weatherByIndex)) {
      const idx = parseInt(idxStr, 10);
      if (idx >= 0 && idx < doc.entries.length && weather) {
        doc.entries[idx] = { ...doc.entries[idx], weather };
        updated++;
      }
    }

    if (updated > 0) {
      doc.markModified('entries');
      await doc.save();
    }

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error('entries-weather error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save weather data' },
      { status: 500 }
    );
  }
}
