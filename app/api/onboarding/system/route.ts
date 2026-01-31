import { NextRequest, NextResponse } from 'next/server';
import { runSystemOnboarding } from '@/lib/services/systemOnboardingService';

// Allow longer timeout for this heavy processing
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { files, email } = body;

        if (!files || !Array.isArray(files) || files.length === 0) {
            return NextResponse.json({ success: false, error: 'No files provided' }, { status: 400 });
        }

        console.log(`[Onboarding API] Received ${files.length} files. Starting magic onboarding...`);

        const results = await runSystemOnboarding(files, email || 'user@example.com');

        return NextResponse.json({
            success: true,
            message: 'Magic onboarding complete',
            data: results
        });
    } catch (error) {
        console.error('[Onboarding API] Error:', error);
        return NextResponse.json(
            { success: false, error: (error as Error).message },
            { status: 500 }
        );
    }
}
