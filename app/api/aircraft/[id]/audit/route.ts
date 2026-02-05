import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Aircraft from '@/lib/models/Aircraft';
import { runAV1ONICSAudit, getAV1ONICSSummary } from '@/lib/services/av1onicsService';
import { requireAuth } from '@/lib/auth-helpers';
import mongoose from 'mongoose';

/**
 * POST /api/aircraft/[id]/audit
 * Run AV1ONICS maintenance audit for an aircraft
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid aircraft ID' },
        { status: 400 }
      );
    }

    // Get aircraft (scoped to user)
    const aircraft = await Aircraft.findOne({ _id: id, userId });
    if (!aircraft) {
      return NextResponse.json(
        { success: false, error: 'Aircraft not found' },
        { status: 404 }
      );
    }

    // Parse request body for audit options
    let options = {
      isIFRFlight: false,
      isForHire: false,
    };

    try {
      const body = await request.json();
      options = {
        isIFRFlight: body.isIFRFlight || false,
        isForHire: body.isForHire || aircraft.airworthinessStatus?.isForHire || false,
      };
    } catch {
      // Use defaults if no body
    }

    // Run AV1ONICS audit
    const audit = runAV1ONICSAudit(aircraft, options);

    // Get summary string
    const summary = getAV1ONICSSummary(audit);

    return NextResponse.json({
      success: true,
      audit,
      summary,
    });
  } catch (error) {
    console.error('AV1ONICS audit error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to run audit' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/aircraft/[id]/audit
 * Get the latest AV1ONICS audit for an aircraft
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid aircraft ID' },
        { status: 400 }
      );
    }

    // Get aircraft (scoped to user)
    const aircraft = await Aircraft.findOne({ _id: id, userId });
    if (!aircraft) {
      return NextResponse.json(
        { success: false, error: 'Aircraft not found' },
        { status: 404 }
      );
    }

    // Run fresh audit (could cache in future)
    const audit = runAV1ONICSAudit(aircraft);
    const summary = getAV1ONICSSummary(audit);

    return NextResponse.json({
      success: true,
      audit,
      summary,
    });
  } catch (error) {
    console.error('AV1ONICS audit error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get audit' },
      { status: 500 }
    );
  }
}
