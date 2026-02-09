import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import Flight, { IWeatherData } from '@/lib/models/Flight';
import { IPilot } from '@/lib/models/Pilot';
import { fetchWeatherData } from '@/lib/services/weatherService';
import { sendThreatAlert } from '@/lib/services/emailService';
import { recoverStuckDocuments } from '@/lib/services/backgroundProcessor';

interface ThreatAnalysisResult {
    hasThreats: boolean;
    threats: string[];
    newStatus: 'go' | 'caution' | 'no-go';
}

async function analyzeFlight(flightId: string, weatherOverride?: IWeatherData): Promise<ThreatAnalysisResult> {
    const flight = await Flight.findById(flightId).populate('pilot').exec();

    if (!flight) {
        throw new Error('Flight not found');
    }

    const pilot = flight.pilot as unknown as IPilot;
    const threats: string[] = [];
    let newStatus: 'go' | 'caution' | 'no-go' = 'go';

    // 1. Fetch Weather
    const weather = weatherOverride || await fetchWeatherData(flight.departureAirport);

    if (weather) {
        // Save weather to flight
        flight.weather = weather;

        // 2. Analyze Conditions

        // IFR Check
        const isIFR = weather.flightCategory === 'IFR' || weather.flightCategory === 'LIFR';

        if (isIFR) {
            if (!pilot.certificates.instrumentRated) {
                threats.push(`CRITICAL: IFR conditions at ${flight.departureAirport} (${weather.flightCategory}) but pilot is not Instrument Rated.`);
                newStatus = 'no-go';
            } else {
                threats.push(`NOTICE: IFR conditions at ${flight.departureAirport}.`);
                if (newStatus === 'go') newStatus = 'caution';
            }
        }

        // Wind Check
        const windSpeed = weather.wind.speed;
        const windGust = weather.wind.gust || 0;

        if (windSpeed > 30 || windGust > 30) {
            threats.push(`WARNING: High winds at ${flight.departureAirport} (${windSpeed}G${windGust}kt).`);
            if (newStatus !== 'no-go') newStatus = 'no-go';
        } else if (windSpeed > 20 || windGust > 20) {
            threats.push(`CAUTION: Moderate winds at ${flight.departureAirport} (${windSpeed}kts).`);
            if (newStatus === 'go') newStatus = 'caution';
        }

        // 3. Update Flight Status & Checks
        flight.overallStatus = newStatus;

        // Remove old safety checks to avoid duplicates
        flight.legalityChecks = flight.legalityChecks.filter(c => c.category !== 'safety');

        threats.forEach(msg => {
            flight.legalityChecks.push({
                category: 'safety',
                item: 'Weather Threat',
                status: msg.includes('CRITICAL') || msg.includes('WARNING') ? 'fail' : 'warning',
                message: msg,
                details: `Analyzed at ${new Date().toISOString()}`
            });
        });

        await flight.save();

        // 4. Notify if severe threats
        if (newStatus === 'no-go' && !flight.emailSent) {
            await sendThreatAlert(pilot.email, flight, threats);
            flight.emailSent = true;
            await flight.save();
        }
    }

    return {
        hasThreats: threats.length > 0,
        threats,
        newStatus
    };
}

export async function GET(request: Request) {
    // 1. Validate Cron Secret (block if not configured)
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return NextResponse.json({ success: false, error: 'Cron not configured' }, { status: 503 });
    }
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Ensure DB connection (Next.js serverless handling)
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_URI!);
        }

        // 2. Find Active Flights (Future + Not Cancelled/Completed)
        const now = new Date();
        const activeFlights = await Flight.find({
            scheduledDate: { $gt: now },
            status: { $in: ['planned', 'go', 'caution'] }
        }).select('_id');

        // 2b. Recover stuck document uploads
        let recoveredDocs = 0;
        try {
          recoveredDocs = await recoverStuckDocuments();
        } catch (recoverError) {
          console.error('Document recovery error:', recoverError);
        }

        // 3. Analyze Each
        const results = await Promise.all(
            activeFlights.map(async (flight) => {
                try {
                    const result = await analyzeFlight(flight._id.toString());
                    return { id: flight._id, ...result };
                } catch (e) {
                    console.error(`Error analyzing flight ${flight._id}:`, e);
                    return { id: flight._id, error: (e as Error).message };
                }
            })
        );

        return NextResponse.json({
            success: true,
            checked: results.length,
            recoveredDocs,
            results
        });

    } catch (error) {
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
