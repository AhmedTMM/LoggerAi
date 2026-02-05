import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import Aircraft from '@/lib/models/Aircraft';
import { requireAuth } from '@/lib/auth-helpers';

/**
 * Attach aircraft details to logbook entries
 * Looks up existing aircraft records and attaches make/model info
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

    // Extract unique tail numbers from entries
    const tailNumbers = new Set<string>();
    document.entries.forEach((entry: any) => {
      const tailNumber = entry.aircraftIdent || entry.tailNumber;
      if (tailNumber) {
        const normalized = tailNumber.toUpperCase().trim().replace(/\s+/g, '');
        if (normalized) {
          tailNumbers.add(normalized);
        }
      }
    });

    if (tailNumbers.size === 0) {
      return NextResponse.json({
        success: true,
        updatedCount: 0,
        message: 'No tail numbers found in entries',
      });
    }

    // Look up aircraft records
    const aircraftRecords = await Aircraft.find({
      userId,
      tailNumber: { $in: Array.from(tailNumbers) },
    });

    const aircraftMap = new Map<string, any>();
    aircraftRecords.forEach((aircraft: any) => {
      const normalized = aircraft.tailNumber.toUpperCase().trim().replace(/\s+/g, '');
      aircraftMap.set(normalized, {
        tailNumber: aircraft.tailNumber,
        manufacturer: aircraft.manufacturer,
        model: aircraft.model,
        year: aircraft.year,
      });
    });

    // Update entries with aircraft info
    let updateCount = 0;
    document.entries.forEach((entry: any) => {
      const tailNumber = entry.aircraftIdent || entry.tailNumber;
      if (tailNumber) {
        const normalized = tailNumber.toUpperCase().trim().replace(/\s+/g, '');
        const aircraftInfo = aircraftMap.get(normalized);

        if (aircraftInfo && !entry.aircraftInfo) {
          entry.aircraftInfo = aircraftInfo;
          updateCount++;
        }
      }
    });

    // Save document
    await document.save();

    console.log(`[EnrichAircraft] Updated ${updateCount} entries with aircraft data for document ${id}`);

    return NextResponse.json({
      success: true,
      updatedCount: updateCount,
      foundAircraft: aircraftMap.size,
      totalTailNumbers: tailNumbers.size,
    });
  } catch (error) {
    console.error('Enrich aircraft error:', error);
    return NextResponse.json(
      { success: false, error: 'An internal error occurred while enriching aircraft data' },
      { status: 500 }
    );
  }
}
