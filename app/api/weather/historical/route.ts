import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalMETAR } from '@/lib/services/historicalWeatherService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { airport, date } = body;

    console.log(`[API] Historical weather request: ${airport} on ${date}`);

    if (!airport || !date) {
      return NextResponse.json(
        { success: false, error: 'Missing airport or date' },
        { status: 400 }
      );
    }

    const flightDate = new Date(date);
    if (isNaN(flightDate.getTime())) {
      console.error(`[API] Invalid date format: ${date}`);
      return NextResponse.json(
        { success: false, error: 'Invalid date format' },
        { status: 400 }
      );
    }

    const weather = await fetchHistoricalMETAR(airport, flightDate);

    if (!weather) {
      console.warn(`[API] No weather data found for ${airport} on ${date}`);
      return NextResponse.json(
        { success: false, error: 'No historical weather data found' },
        { status: 404 }
      );
    }

    console.log(`[API] Successfully fetched weather for ${airport}: ${weather.conditions.flightCategory}`);

    return NextResponse.json({
      success: true,
      weather,
    });

  } catch (error) {
    console.error('Historical weather API error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
