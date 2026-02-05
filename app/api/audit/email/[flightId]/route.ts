import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import Flight from '@/lib/models/Flight';
import { requireAuth } from '@/lib/auth-helpers';
import { sendAuditEmail } from '@/lib/services/emailService';

export async function POST(
  request: NextRequest,
  { params }: { params: { flightId: string } }
) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    await dbConnect();

    if (!mongoose.Types.ObjectId.isValid(params.flightId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid ID' },
        { status: 400 }
      );
    }

    const flight = await Flight.findOne({ _id: params.flightId, userId })
      .populate('pilot')
      .populate('aircraft');

    if (!flight) {
      return NextResponse.json(
        { success: false, error: 'Flight not found' },
        { status: 404 }
      );
    }

    const result = await sendAuditEmail(flight);

    if (result.success) {
      flight.emailSent = true;
      await flight.save();
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to send audit email' },
      { status: 500 }
    );
  }
}
