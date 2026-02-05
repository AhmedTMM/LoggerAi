import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Flight from '@/lib/models/Flight';
import { requireAuth } from '@/lib/auth-helpers';
import mongoose from 'mongoose';

// Allowed fields for update — prevents mass assignment of userId, _id, etc.
const ALLOWED_UPDATE_FIELDS = [
  'pilot', 'aircraft', 'pilotName', 'aircraftTailNumber', 'aircraftModel',
  'scheduledDate', 'scheduledDateTime', 'scheduledTime', 'estimatedDuration',
  'departureAirport', 'arrivalAirport', 'alternateAirport', 'route',
  'status', 'overallStatus', 'legalityChecks', 'weather', 'arrivalWeather',
  'flightPlannerData', 'safetyAnalysisSnapshot', 'notes', 'emailSent',
  'preFlightAlertSent', 'safetyAuditId',
];

function sanitizeUpdateBody(body: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const key of ALLOWED_UPDATE_FIELDS) {
    if (key in body) {
      sanitized[key] = body[key];
    }
  }
  return sanitized;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid flight ID' },
        { status: 400 }
      );
    }

    await dbConnect();
    const flight = await Flight.findOne({ _id: id, userId })
      .populate('pilot')
      .populate('aircraft');

    if (!flight) {
      return NextResponse.json(
        { success: false, error: 'Flight not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: flight });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch flight' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid flight ID' },
        { status: 400 }
      );
    }

    await dbConnect();
    const body = await request.json();
    const sanitizedBody = sanitizeUpdateBody(body);

    const flight = await Flight.findOneAndUpdate(
      { _id: id, userId },
      sanitizedBody,
      { new: true, runValidators: true }
    )
      .populate('pilot')
      .populate('aircraft');

    if (!flight) {
      return NextResponse.json(
        { success: false, error: 'Flight not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: flight });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to update flight' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid flight ID' },
        { status: 400 }
      );
    }

    await dbConnect();
    const flight = await Flight.findOneAndDelete({ _id: id, userId });
    if (!flight) {
      return NextResponse.json(
        { success: false, error: 'Flight not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, message: 'Flight deleted' });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to delete flight' },
      { status: 500 }
    );
  }
}
