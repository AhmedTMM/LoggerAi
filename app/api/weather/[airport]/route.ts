import { NextRequest, NextResponse } from 'next/server';
import {
  fetchWeatherData,
  fetchTAFData,
  fetchEnhancedWeatherData,
  fetchParsedTAF,
  fetchWeatherForTime,
  fetchRouteWeather,
} from '@/lib/services/weatherService';
import { requireAuth } from '@/lib/auth-helpers';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { airport: string } }
) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    // Rate limit weather requests: 60 per minute per user
    const rateLimited = rateLimit(`weather:${userId}`, { maxRequests: 60, windowSeconds: 60 });
    if (rateLimited) return rateLimited;

    const airport = params.airport.toUpperCase();

    // Validate airport code format (ICAO: 4 chars, FAA: 3-4 chars)
    if (!/^[A-Z0-9]{3,4}$/.test(airport)) {
      return NextResponse.json(
        { success: false, error: 'Invalid airport code' },
        { status: 400 }
      );
    }
    const { searchParams } = new URL(request.url);

    // Check for enhanced mode
    const enhanced = searchParams.get('enhanced') === 'true';
    const scheduledTime = searchParams.get('scheduledTime');
    const arrivalAirport = searchParams.get('arrival');

    // If route weather requested
    if (arrivalAirport) {
      const routeWeather = await fetchRouteWeather(
        airport,
        arrivalAirport.toUpperCase(),
        scheduledTime ? new Date(scheduledTime) : undefined
      );

      return NextResponse.json({
        success: true,
        data: {
          departure: routeWeather.departure,
          arrival: routeWeather.arrival,
          enrouteHazards: routeWeather.enroute,
        },
      });
    }

    // If time-specific weather requested
    if (scheduledTime) {
      const weather = await fetchWeatherForTime(airport, new Date(scheduledTime));

      if (!weather) {
        return NextResponse.json(
          { success: false, error: `No weather data found for ${airport}` },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: weather,
      });
    }

    // Enhanced weather with TAF parsed
    if (enhanced) {
      const [weather, tafData] = await Promise.all([
        fetchEnhancedWeatherData(airport),
        fetchParsedTAF(airport),
      ]);

      if (!weather) {
        return NextResponse.json(
          { success: false, error: `No weather data found for ${airport}` },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          ...weather,
          taf: tafData?.raw,
          tafPeriods: tafData?.periods,
        },
      });
    }

    // Standard METAR and TAF fetch
    const [metar, taf] = await Promise.all([
      fetchWeatherData(airport),
      fetchTAFData(airport),
    ]);

    if (!metar) {
      return NextResponse.json(
        { success: false, error: `No weather data found for ${airport}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...metar,
        taf: taf || undefined,
      },
    });
  } catch (error) {
    console.error('Weather fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch weather data' },
      { status: 500 }
    );
  }
}
