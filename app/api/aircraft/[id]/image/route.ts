import { NextRequest, NextResponse } from 'next/server';
import { fetchAircraftImage } from '@/lib/services/firecrawlService';
import dbConnect from '@/lib/db';
import Aircraft from '@/lib/models/Aircraft';
import { requireAuth } from '@/lib/auth-helpers';
import mongoose from 'mongoose';

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
        { success: false, error: 'Invalid aircraft ID' },
        { status: 400 }
      );
    }

    const aircraft = await Aircraft.findOne({ _id: params.id, userId });

    if (!aircraft) {
      return NextResponse.json(
        { success: false, error: 'Aircraft not found' },
        { status: 404 }
      );
    }

    // Fetch image using tail number
    const result = await fetchAircraftImage(aircraft.tailNumber);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    // Update aircraft with image URL if found
    if (result.imageUrl) {
      aircraft.imageUrl = result.imageUrl;
      await aircraft.save();
    }

    return NextResponse.json({
      success: true,
      imageUrl: result.imageUrl,
    });
  } catch (error) {
    console.error('Aircraft image fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch aircraft image' },
      { status: 500 }
    );
  }
}
