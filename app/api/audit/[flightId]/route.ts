import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Flight from '@/lib/models/Flight';
import { runLegalityAudit } from '@/lib/services/legalityService';
import { runComprehensiveSafetyAnalysis } from '@/lib/services/comprehensiveSafetyService';
import { sendAuditEmail, sendOwnerDangerAlert } from '@/lib/services/emailService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for comprehensive analysis

export async function POST(
  request: NextRequest,
  { params }: { params: { flightId: string } }
) {
  try {
    await dbConnect();
    const { flightId } = params;

    // Check for query params
    const { searchParams } = new URL(request.url);
    const comprehensive = searchParams.get('comprehensive') !== 'false'; // Default true

    let result;
    let comprehensiveAnalysis;

    if (comprehensive) {
      // Run comprehensive safety analysis
      comprehensiveAnalysis = await runComprehensiveSafetyAnalysis(flightId);
      result = {
        overallStatus: comprehensiveAnalysis.goNoGoRecommendation,
        checks: (await Flight.findById(flightId))?.legalityChecks || [],
        summary: comprehensiveAnalysis.reasoning,
        riskScenarios: comprehensiveAnalysis.combinedRiskScenarios,
      };
    } else {
      // Run basic legality audit
      result = await runLegalityAudit(flightId, false);
    }

    // If no-go or caution, send email alerts
    let emailNotifications: { pilotNotified: boolean; ownerNotified: boolean; ownerEmail?: string } = {
      pilotNotified: false,
      ownerNotified: false,
    };

    if (result.overallStatus === 'no-go' || result.overallStatus === 'caution') {
      const flight = await Flight.findById(flightId)
        .populate('pilot')
        .populate('aircraft')
        .exec();
      if (flight) {
        // Send pilot email (only on no-go, and only once)
        if (result.overallStatus === 'no-go' && !flight.emailSent) {
          try {
            const pilotResult = await sendAuditEmail(flight);
            if (pilotResult.success) {
              emailNotifications.pilotNotified = true;
              flight.emailSent = true;
            }
          } catch (emailErr) {
            console.warn('Pilot email send failed:', emailErr);
          }
        }

        // Send owner danger alert (no-go or caution)
        try {
          const ownerResult = await sendOwnerDangerAlert(flight);
          if (ownerResult.success) {
            emailNotifications.ownerNotified = true;
            emailNotifications.ownerEmail = (flight.aircraft as any)?.owner?.email;
          }
        } catch (emailErr) {
          console.warn('Owner alert send failed:', emailErr);
        }

        await flight.save();
      }
    }

    // Return populated flight
    const populatedFlight = await Flight.findById(flightId)
      .populate('pilot', 'name email certificates experience safetyAnalysis')
      .populate('aircraft', 'tailNumber model maintenanceDates currentHours operatingLimits safetyAnalysis owner');

    return NextResponse.json({
      success: true,
      data: populatedFlight,
      audit: result,
      comprehensiveAnalysis: comprehensive ? comprehensiveAnalysis : undefined,
      emailNotifications,
    });
  } catch (error) {
    console.error('Audit error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// GET to retrieve existing audit data
export async function GET(
  request: NextRequest,
  { params }: { params: { flightId: string } }
) {
  try {
    await dbConnect();
    const { flightId } = params;

    const flight = await Flight.findById(flightId)
      .populate('pilot', 'name email certificates experience safetyAnalysis')
      .populate('aircraft', 'tailNumber model maintenanceDates currentHours operatingLimits safetyAnalysis owner');

    if (!flight) {
      return NextResponse.json(
        { success: false, error: 'Flight not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        flight,
        safetyAnalysis: flight.safetyAnalysisSnapshot,
        legalityChecks: flight.legalityChecks,
        overallStatus: flight.overallStatus,
        weather: {
          departure: flight.weather,
          arrival: flight.arrivalWeather,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
