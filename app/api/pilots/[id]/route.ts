import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Pilot from '@/lib/models/Pilot';
import { requireAuth } from '@/lib/auth-helpers';
import mongoose from 'mongoose';

// Allowed fields for update — prevents mass assignment of userId, _id, etc.
const ALLOWED_UPDATE_FIELDS = [
  'name', 'email', 'certificates', 'endorsements', 'experience',
  'flightEntries', 'medicalExpiration', 'flightReviewExpiration',
  'weatherExperience', 'safetyAnalysis', 'linkedDocuments',
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
        { success: false, error: 'Invalid pilot ID' },
        { status: 400 }
      );
    }

    await dbConnect();
    const pilot = await Pilot.findOne({ _id: id, userId });
    if (!pilot) {
      return NextResponse.json(
        { success: false, error: 'Pilot not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: pilot });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch pilot' },
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
        { success: false, error: 'Invalid pilot ID' },
        { status: 400 }
      );
    }

    await dbConnect();
    const body = await request.json();
    const sanitizedBody = sanitizeUpdateBody(body);

    const pilot = await Pilot.findOneAndUpdate(
      { _id: id, userId },
      sanitizedBody,
      { new: true, runValidators: true }
    );
    if (!pilot) {
      return NextResponse.json(
        { success: false, error: 'Pilot not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: pilot });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to update pilot' },
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
        { success: false, error: 'Invalid pilot ID' },
        { status: 400 }
      );
    }

    await dbConnect();
    const pilot = await Pilot.findOneAndDelete({ _id: id, userId });
    if (!pilot) {
      return NextResponse.json(
        { success: false, error: 'Pilot not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, message: 'Pilot deleted' });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to delete pilot' },
      { status: 500 }
    );
  }
}
