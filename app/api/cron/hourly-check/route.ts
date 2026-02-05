import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import Flight from '@/lib/models/Flight';
import { analyzeFlight } from '@/lib/services/threatService';

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
            results
        });

    } catch (error) {
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
