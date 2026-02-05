import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { searchPilotAccidents } from '@/lib/services/firecrawlService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const { error } = await requireAuth();
        if (error) return error;

        const { searchParams } = new URL(request.url);
        const name = searchParams.get('name');

        if (!name) {
            return NextResponse.json(
                { success: false, error: 'Pilot name required' },
                { status: 400 }
            );
        }

        const accidentResults = await searchPilotAccidents(name);

        return NextResponse.json({
            success: true,
            data: {
                reports: accidentResults.reports
            }
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: 'Failed to search pilot safety records' },
            { status: 500 }
        );
    }
}
