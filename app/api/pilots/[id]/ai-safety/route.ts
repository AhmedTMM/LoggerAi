import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Pilot from '@/lib/models/Pilot';
import { analyzePilotSafety } from '@/lib/services/aiService';

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        await dbConnect();
        const pilot = await Pilot.findById(params.id);

        if (!pilot) {
            return NextResponse.json({ success: false, error: 'Pilot not found' }, { status: 404 });
        }

        // Call AI Service
        const analysis = await analyzePilotSafety(pilot);

        // Save result to database
        pilot.safetyAnalysis = {
            lastAnalyzed: new Date(),
            score: analysis.overall_assessment.score,
            findings: analysis.risk_factors || []
        };
        await pilot.save();

        return NextResponse.json({ success: true, data: { analysis, pilot } });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: (error as Error).message || 'Failed to analyze pilot safety' },
            { status: 500 }
        );
    }
}
