import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Pilot from '@/lib/models/Pilot';
import { analyzePilotSafety } from '@/lib/services/aiService';
import { requireAuth } from '@/lib/auth-helpers';
import { checkFeatureAccess, incrementUsage } from '@/lib/subscription';

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Check authentication
        const { error, userId } = await requireAuth();
        if (error) return error;

        // Check subscription access for AI analysis
        const access = await checkFeatureAccess(userId!, 'aiAnalysis');
        if (!access.allowed) {
            return NextResponse.json(
                {
                    success: false,
                    error: access.reason,
                    upgradeRequired: true,
                    subscription: access.subscription,
                },
                { status: 403 }
            );
        }

        await dbConnect();
        const pilot = await Pilot.findById(params.id);

        if (!pilot) {
            return NextResponse.json({ error: 'Pilot not found' }, { status: 404 });
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

        // Increment usage after successful analysis
        await incrementUsage(userId!, 'aiAnalysis');

        return NextResponse.json({ analysis, pilot });
    } catch (error: any) {
        console.error('Error in AI safety analysis:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to analyze pilot safety' },
            { status: 500 }
        );
    }
}
