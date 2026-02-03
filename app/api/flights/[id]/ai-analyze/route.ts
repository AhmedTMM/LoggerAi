import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Flight from '@/lib/models/Flight';
import { generateAISafetyAnalysis, sendAISafetyEmail, IAISafetyAnalysis } from '@/lib/services/aiSafetyService';
import { IPilot } from '@/lib/models/Pilot';
import { IAircraft } from '@/lib/models/Aircraft';
import { requireAuth } from '@/lib/auth-helpers';
import { checkFeatureAccess, incrementUsage } from '@/lib/subscription';

export const maxDuration = 60; // Allow up to 60 seconds for AI analysis

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const { error, userId } = await requireAuth();
    if (error) return error;

    // Check subscription access for AI analysis
    const access = await checkFeatureAccess(userId!, 'aiAnalysis');
    if (!access.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: access.reason,
          upgradeRequired: true,
          subscription: access.subscription,
        },
        { status: 403 }
      );
    }

    await dbConnect();

    const body = await request.json().catch(() => ({}));
    const sendEmail = body.sendEmail !== false; // Default to sending email

    // Fetch flight with populated pilot and aircraft
    const flight = await Flight.findById(params.id)
      .populate('pilot')
      .populate('aircraft')
      .exec();

    if (!flight) {
      return NextResponse.json(
        { success: false, error: 'Flight not found' },
        { status: 404 }
      );
    }

    const pilot = flight.pilot as unknown as IPilot;
    const aircraft = flight.aircraft as unknown as IAircraft;

    if (!pilot || !aircraft) {
      return NextResponse.json(
        { success: false, error: 'Flight missing pilot or aircraft reference' },
        { status: 400 }
      );
    }

    // Check if we have an existing safety analysis
    if (!flight.safetyAnalysisSnapshot) {
      return NextResponse.json(
        { success: false, error: 'Run standard audit first before AI analysis' },
        { status: 400 }
      );
    }

    // Generate AI analysis
    console.log(`[AI] Generating AI safety analysis for flight ${params.id}...`);
    const aiAnalysis = await generateAISafetyAnalysis(
      flight,
      pilot,
      aircraft,
      flight.safetyAnalysisSnapshot
    );

    if (!aiAnalysis) {
      return NextResponse.json(
        { success: false, error: 'AI analysis failed - check GEMINI_API_KEY configuration' },
        { status: 500 }
      );
    }

    // Store AI analysis on the flight
    flight.safetyAnalysisSnapshot = {
      ...flight.safetyAnalysisSnapshot,
      aiAnalysis,
    };

    // Update reasoning with AI summary
    flight.safetyAnalysisSnapshot.reasoning = aiAnalysis.summary;

    // Update go/no-go based on AI verdict if it's more conservative
    const verdictMap = { 'NO-GO': 'no-go', 'CAUTION': 'caution', 'GO': 'go' } as const;
    const aiVerdict = verdictMap[aiAnalysis.finalVerdict];

    // Use AI verdict if more conservative
    const verdictPriority = { 'no-go': 3, 'caution': 2, 'go': 1 };
    if (verdictPriority[aiVerdict] > verdictPriority[flight.overallStatus]) {
      flight.overallStatus = aiVerdict;
      flight.safetyAnalysisSnapshot.goNoGoRecommendation = aiVerdict;
    }

    await flight.save();

    // Increment usage after successful analysis
    await incrementUsage(userId!, 'aiAnalysis');

    // Send email with AI analysis - always to hardcoded address
    let emailResult = { success: false, message: 'Email not sent' };
    const recipientEmail = 'ahmed@abushagur.com';
    if (sendEmail) {
      console.log(`[AI] Sending AI analysis email to ${recipientEmail}...`);
      emailResult = await sendAISafetyEmail(flight, aiAnalysis, recipientEmail);
      console.log(`[AI] Email result:`, emailResult);
    }

    return NextResponse.json({
      success: true,
      data: {
        aiAnalysis,
        flightStatus: flight.overallStatus,
        emailSent: emailResult.success,
        emailMessage: emailResult.message,
      },
    });

  } catch (error) {
    console.error('AI Analysis error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// Get existing AI analysis
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbConnect();

    const flight = await Flight.findById(params.id)
      .populate('pilot')
      .populate('aircraft')
      .exec();

    if (!flight) {
      return NextResponse.json(
        { success: false, error: 'Flight not found' },
        { status: 404 }
      );
    }

    const aiAnalysis = (flight.safetyAnalysisSnapshot as any)?.aiAnalysis;

    return NextResponse.json({
      success: true,
      data: {
        hasAiAnalysis: !!aiAnalysis,
        aiAnalysis: aiAnalysis || null,
      },
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
