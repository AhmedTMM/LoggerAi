import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Flight from '@/lib/models/Flight';
import { runLegalityAudit } from '@/lib/services/legalityService';
import { runComprehensiveSafetyAnalysis } from '@/lib/services/comprehensiveSafetyService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const upcoming = searchParams.get('upcoming');
    const pilotId = searchParams.get('pilotId');
    const aircraftId = searchParams.get('aircraftId');
    const limit = searchParams.get('limit');

    let query: Record<string, unknown> = {};

    if (status) {
      query.status = status;
    }

    if (upcoming === 'true') {
      query.scheduledDate = { $gte: new Date() };
    }

    if (pilotId) {
      query.pilot = pilotId;
    }

    if (aircraftId) {
      query.aircraft = aircraftId;
    }

    let flightsQuery = Flight.find(query)
      .populate('pilot', 'name email certificates experience safetyAnalysis')
      .populate('aircraft', 'tailNumber model maintenanceDates currentHours operatingLimits safetyAnalysis')
      .sort({ scheduledDate: 1 });

    if (limit) {
      flightsQuery = flightsQuery.limit(parseInt(limit, 10));
    }

    const flights = await flightsQuery;

    return NextResponse.json({ success: true, data: flights });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const body = await request.json();

    // Extract time if provided separately
    const { scheduledTime, scheduledDate, ...restBody } = body;

    // Compute scheduledDateTime if both date and time provided
    let scheduledDateTime: Date | undefined;
    if (scheduledDate) {
      const baseDate = new Date(scheduledDate);

      if (scheduledTime) {
        const [hours, minutes] = scheduledTime.split(':').map(Number);
        baseDate.setHours(hours || 0, minutes || 0, 0, 0);
      }

      scheduledDateTime = baseDate;
    }

    const flight = new Flight({
      ...restBody,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date(),
      scheduledTime,
      scheduledDateTime,
      status: 'planned',
      overallStatus: 'no-go',
    });

    await flight.save();

    // Run comprehensive safety/legality audit (creates snapshot)
    try {
      await runComprehensiveSafetyAnalysis(flight._id.toString());
    } catch (auditError) {
      console.warn('Initial audit failed, flight created without analysis:', auditError);
      // Fall back to basic audit
      try {
        await runLegalityAudit(flight._id.toString(), false);
      } catch (basicAuditError) {
        console.warn('Basic audit also failed:', basicAuditError);
      }
    }

    const populatedFlight = await Flight.findById(flight._id)
      .populate('pilot', 'name email certificates experience safetyAnalysis')
      .populate('aircraft', 'tailNumber model maintenanceDates currentHours operatingLimits safetyAnalysis');

    return NextResponse.json({ success: true, data: populatedFlight }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}
