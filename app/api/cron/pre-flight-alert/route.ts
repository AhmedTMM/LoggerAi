import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import Flight from '@/lib/models/Flight';
import { createFlightActionTokens } from '@/lib/models/EmailAction';
import { sendPreFlightAgenticAlert } from '@/lib/services/emailService';

export async function GET(request: Request) {
  // 1. Validate Cron Secret (block if not configured)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, error: 'Cron not configured' }, { status: 503 });
  }
  const authHeader = request.headers.get('authorization');
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Ensure DB connection
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI!);
    }

    const now = new Date();
    // Find flights scheduled within the next 60-90 minutes
    // We use a window to catch flights that might be missed if cron runs slightly off-schedule
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const ninetyMinutesFromNow = new Date(now.getTime() + 90 * 60 * 1000);

    // Find dangerous flights that:
    // 1. Are scheduled within the next 60-90 minutes
    // 2. Have not had a pre-flight alert sent yet
    // 3. Are marked as no-go or caution
    // 4. Are still in an active status
    const dangerousFlights = await Flight.find({
      $or: [
        // Match using scheduledDateTime if available
        {
          scheduledDateTime: {
            $gte: oneHourFromNow,
            $lte: ninetyMinutesFromNow,
          },
        },
        // Fall back to scheduledDate if scheduledDateTime not set
        {
          scheduledDateTime: { $exists: false },
          scheduledDate: {
            $gte: oneHourFromNow,
            $lte: ninetyMinutesFromNow,
          },
        },
      ],
      overallStatus: { $in: ['no-go', 'caution'] },
      status: { $in: ['planned', 'go', 'caution'] },
      preFlightAlertSent: { $ne: true },
    })
      .populate('pilot')
      .populate('aircraft');

    const results: {
      flightId: string;
      success: boolean;
      message: string;
      ownerEmail?: string;
    }[] = [];

    for (const flight of dangerousFlights) {
      const pilot = flight.pilot as any;
      const aircraft = flight.aircraft as any;

      // Skip if no owner email
      if (!aircraft?.owner?.email) {
        results.push({
          flightId: flight._id.toString(),
          success: false,
          message: 'No aircraft owner email configured',
        });
        continue;
      }

      // Skip if no pilot email
      if (!pilot?.email) {
        results.push({
          flightId: flight._id.toString(),
          success: false,
          message: 'No pilot email configured',
        });
        continue;
      }

      try {
        // Create action tokens for this flight
        // For mechanic, we could use a default mechanic from the aircraft or flight school
        // For now, we'll leave mechanic as optional
        const actionTokens = await createFlightActionTokens(
          flight._id,
          aircraft.owner.email,
          pilot.email,
          pilot.name,
          undefined, // mechanicEmail - could be added from aircraft.mechanic or flightSchool.mechanic
          undefined // mechanicName
        );

        // Send the agentic pre-flight alert email
        const emailResult = await sendPreFlightAgenticAlert(flight, actionTokens);

        if (emailResult.success) {
          // Mark the flight as having been alerted
          flight.preFlightAlertSent = true;
          await flight.save();

          results.push({
            flightId: flight._id.toString(),
            success: true,
            message: emailResult.message,
            ownerEmail: aircraft.owner.email,
          });
        } else {
          results.push({
            flightId: flight._id.toString(),
            success: false,
            message: emailResult.message,
          });
        }
      } catch (error) {
        console.error(`Error processing flight ${flight._id}:`, error);
        results.push({
          flightId: flight._id.toString(),
          success: false,
          message: (error as Error).message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: true,
      message: `Pre-flight alerts processed`,
      summary: {
        found: dangerousFlights.length,
        sent: successCount,
        failed: dangerousFlights.length - successCount,
      },
      results,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
