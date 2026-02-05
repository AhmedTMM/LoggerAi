import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import mongoose from 'mongoose';
import Pilot from '@/lib/models/Pilot';
import { analyzePilotSafety } from '@/lib/services/aiService';

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
                { success: false, error: 'Invalid pilot ID' },
                { status: 400 }
            );
        }

        const pilot = await Pilot.findOne({ _id: params.id, userId });

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
            { success: false, error: 'Failed to analyze pilot safety' },
            { status: 500 }
        );
    }
}
