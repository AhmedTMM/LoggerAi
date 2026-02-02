import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import Aircraft from '@/lib/models/Aircraft';
import { auth } from '@/lib/auth';
import { fetchAircraftDetails } from '@/lib/services/firecrawlService';

/**
 * Discover and create aircraft records from tail numbers in logbook entries
 * Uses Firecrawl to fetch FAA registry data for new aircraft
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbConnect();

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = params;

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
        created: 0,
        updated: 0,
        message: 'No tail numbers found in entries',
      });
    }

    console.log(`[DiscoverAircraft] Processing ${tailNumbers.size} tail numbers for document ${id}`);

    let createdCount = 0;
    let updatedCount = 0;
    const aircraftMap = new Map<string, any>();

    // Process each tail number - fetch details but don't create Aircraft records
    for (const tailNumber of Array.from(tailNumbers)) {
      try {
        // Fetch details from FAA registry via Firecrawl
        console.log(`[DiscoverAircraft] Fetching details for ${tailNumber}`);
        const details = await fetchAircraftDetails(tailNumber);

        if (details.success && details.data) {
          // Store aircraft info for updating entries (no Aircraft record created)
          const normalized = tailNumber.toUpperCase().trim().replace(/\s+/g, '');
          aircraftMap.set(normalized, {
            tailNumber,
            manufacturer: details.data.manufacturer || 'Unknown',
            model: details.data.model || 'Unknown',
            year: details.data.year || undefined,
          });

          console.log(`[DiscoverAircraft] Found ${tailNumber}: ${details.data.manufacturer} ${details.data.model}`);
          createdCount++;

          // Rate limiting to avoid hitting Firecrawl API limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.warn(`[DiscoverAircraft] Could not fetch details for ${tailNumber}`);
        }
      } catch (error) {
        console.error(`[DiscoverAircraft] Failed to process ${tailNumber}:`, error);
      }
    }

    // Update entries with aircraft info
    document.entries.forEach((entry: any) => {
      const tailNumber = entry.aircraftIdent || entry.tailNumber;
      if (tailNumber) {
        const normalized = tailNumber.toUpperCase().trim().replace(/\s+/g, '');
        const aircraftInfo = aircraftMap.get(normalized);

        if (aircraftInfo && !entry.aircraftInfo) {
          entry.aircraftInfo = aircraftInfo;
          updatedCount++;
        }
      }
    });

    // Save document
    await document.save();

    console.log(`[DiscoverAircraft] Fetched ${createdCount} aircraft details, updated ${updatedCount} entries for document ${id}`);

    return NextResponse.json({
      success: true,
      fetched: createdCount,
      updated: updatedCount,
      totalTailNumbers: tailNumbers.size,
    });
  } catch (error) {
    console.error('Discover aircraft error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
