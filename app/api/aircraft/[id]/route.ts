import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Aircraft from '@/lib/models/Aircraft';
import { requireAuth } from '@/lib/auth-helpers';
import mongoose from 'mongoose';

// Allowed fields for update — prevents mass assignment of userId, _id, etc.
const ALLOWED_UPDATE_FIELDS = [
  'tailNumber', 'model', 'serial', 'manufacturer', 'year', 'imageUrl', 'pohUrl',
  'operatingLimits', 'maintenanceDates', 'airworthinessStatus', 'melConfig',
  'pohData', 'currentHours', 'logs', 'logbooks', 'owner', 'scrapedData',
  'safetyAnalysis', 'linkedDocuments',
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
        { success: false, error: 'Invalid aircraft ID' },
        { status: 400 }
      );
    }

    await dbConnect();
    const aircraft = await Aircraft.findOne({ _id: id, userId });
    if (!aircraft) {
      return NextResponse.json(
        { success: false, error: 'Aircraft not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: aircraft });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch aircraft' },
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
        { success: false, error: 'Invalid aircraft ID' },
        { status: 400 }
      );
    }

    await dbConnect();
    const body = await request.json();
    const sanitizedBody = sanitizeUpdateBody(body);

    const aircraft = await Aircraft.findOneAndUpdate(
      { _id: id, userId },
      sanitizedBody,
      { new: true, runValidators: true }
    );
    if (!aircraft) {
      return NextResponse.json(
        { success: false, error: 'Aircraft not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: aircraft });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to update aircraft' },
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
        { success: false, error: 'Invalid aircraft ID' },
        { status: 400 }
      );
    }

    await dbConnect();
    const aircraft = await Aircraft.findOneAndDelete({ _id: id, userId });
    if (!aircraft) {
      return NextResponse.json(
        { success: false, error: 'Aircraft not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, message: 'Aircraft deleted' });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to delete aircraft' },
      { status: 500 }
    );
  }
}
