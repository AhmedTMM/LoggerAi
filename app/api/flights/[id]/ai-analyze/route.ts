import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import Flight from '@/lib/models/Flight';
import { requireAuth } from '@/lib/auth-helpers';
import { generateAISafetyAnalysis, sendAISafetyEmail } from '@/lib/services/aiSafetyService';
import { IPilot } from '@/lib/models/Pilot';
import { IAircraft } from '@/lib/models/Aircraft';

export const maxDuration = 60; // Allow up to 60 seconds for AI analysis

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    await dbConnect();

    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid ID' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const sendEmail = body.sendEmail !== false; // Default to sending email

    // Fetch flight with populated pilot and aircraft
    const flight = await Flight.findOne({ _id: params.id, userId })
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

    // Send email with AI analysis
    let emailResult = { success: false, message: 'Email not sent' };
    const recipientEmail = process.env.SAFETY_EMAIL_RECIPIENT;
    if (sendEmail && recipientEmail) {
      emailResult = await sendAISafetyEmail(flight, aiAnalysis, recipientEmail);
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
    return NextResponse.json(
      { success: false, error: 'Failed to run AI analysis' },
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
    const { error, userId } = await requireAuth();
    if (error) return error;

    await dbConnect();

    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid ID' },
        { status: 400 }
      );
    }

    const flight = await Flight.findOne({ _id: params.id, userId })
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
      { success: false, error: 'Failed to retrieve AI analysis' },
      { status: 500 }
    );
  }
}
