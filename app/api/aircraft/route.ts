import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Aircraft from '@/lib/models/Aircraft';
import { fetchAircraftDetails } from '@/lib/services/firecrawlService';
import { parsePOHFromUrl } from '@/lib/services/reductoService';
import { requireAuth } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    await dbConnect();
    const aircraft = await Aircraft.find({ userId }).select('-logs -linkedDocuments').sort({ tailNumber: 1 });
    return NextResponse.json({ success: true, data: aircraft });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    await dbConnect();
    const body = await request.json();

    // Check if this is a "magic add" request (only tail number provided)
    // or if the user wants to force a lookup
    if (body.tailNumber && Object.keys(body).length === 1) {
      // 1. Fetch details from Registry & Firecrawl (includes Image & POH URL)
      const details = await fetchAircraftDetails(body.tailNumber);

      if (!details.success || !details.data) {
        throw new Error(details.error || 'Could not fetch aircraft details');
      }

      let aircraftData = {
        ...details.data,
        userId,
        tailNumber: body.tailNumber,
        currentHours: { hobbs: 0, tach: 0 },
        maintenanceDates: {
          annual: new Date(),
          transponder: new Date(),
          staticSystem: new Date()
        }
      };

      // 2. If we found a POH URL, try to parse it with Reducto for real operating limits
      if (aircraftData.pohUrl) {
        try {
          const pohResult = await parsePOHFromUrl(aircraftData.pohUrl);

          if (pohResult.success && pohResult.data?.extractedData) {
            const parsedLimits = pohResult.data.extractedData;

            // Merge/Overwrite with Reducto data if valid
            if (parsedLimits.vSpeeds || parsedLimits.weights) {
              aircraftData.operatingLimits = {
                vSpeeds: parsedLimits.vSpeeds || aircraftData.operatingLimits?.vSpeeds,
                weights: parsedLimits.weights || aircraftData.operatingLimits?.weights
              };
            }
          }
        } catch (pohError) {
          // Continue with scraped data if Reducto parsing fails
        }
      }

      const aircraft = new Aircraft(aircraftData);
      await aircraft.save();
      return NextResponse.json({ success: true, data: aircraft }, { status: 201 });

    } else {
      // Normal manual add (fallback)
      const aircraft = new Aircraft({ ...body, userId });
      await aircraft.save();
      return NextResponse.json({ success: true, data: aircraft }, { status: 201 });
    }

  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    await dbConnect();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Aircraft ID required' },
        { status: 400 }
      );
    }

    // Only delete if it belongs to the user
    await Aircraft.findOneAndDelete({ _id: id, userId });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
