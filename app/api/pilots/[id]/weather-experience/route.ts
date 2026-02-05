import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import mongoose from 'mongoose';
import Pilot from '@/lib/models/Pilot';

// GET: Retrieve stored weather experience for a pilot
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    await dbConnect();
    const { id } = params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid pilot ID' },
        { status: 400 }
      );
    }

    const pilot = await Pilot.findOne({ _id: id, userId }).select('weatherExperience name');
    if (!pilot) {
      return NextResponse.json(
        { success: false, error: 'Pilot not found' },
        { status: 404 }
      );
    }

    // Return stored weather experience or null if not available
    return NextResponse.json({
      success: true,
      weatherExperience: pilot.weatherExperience || null,
    });
  } catch (error) {
    console.error('Get weather experience error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve weather experience' },
      { status: 500 }
    );
  }
}

// POST: Store/update weather experience for a pilot
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    await dbConnect();
    const { id } = params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid pilot ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { totalFlights, flightsWithWeather, vfr, mvfr, ifr, lifr } = body;

    // Validate required fields
    if (typeof flightsWithWeather !== 'number' || flightsWithWeather < 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid weather experience data' },
        { status: 400 }
      );
    }

    const pilot = await Pilot.findOne({ _id: id, userId });
    if (!pilot) {
      return NextResponse.json(
        { success: false, error: 'Pilot not found' },
        { status: 404 }
      );
    }

    // Update weather experience
    pilot.weatherExperience = {
      totalFlights: totalFlights || 0,
      flightsWithWeather: flightsWithWeather || 0,
      vfr: vfr || 0,
      mvfr: mvfr || 0,
      ifr: ifr || 0,
      lifr: lifr || 0,
      lastUpdated: new Date(),
    };

    await pilot.save();

    return NextResponse.json({
      success: true,
      weatherExperience: pilot.weatherExperience,
    });
  } catch (error) {
    console.error('Update weather experience error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update weather experience' },
      { status: 500 }
    );
  }
}
