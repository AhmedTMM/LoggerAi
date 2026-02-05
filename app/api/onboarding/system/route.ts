import { NextRequest, NextResponse } from 'next/server';
import { runSystemOnboarding } from '@/lib/services/systemOnboardingService';
import { requireAuth } from '@/lib/auth-helpers';

// Allow longer timeout for this heavy processing
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const { error, userId, user } = await requireAuth();
        if (error) return error;

        const body = await request.json();
        const { files } = body;

        if (!files || !Array.isArray(files) || files.length === 0) {
            return NextResponse.json({ success: false, error: 'No files provided' }, { status: 400 });
        }

        // Limit the number of files to prevent abuse
        if (files.length > 50) {
            return NextResponse.json({ success: false, error: 'Too many files. Maximum is 50.' }, { status: 400 });
        }

        console.log(`[Onboarding API] Received ${files.length} files for user ${userId}. Starting magic onboarding...`);

        // Use authenticated user's email, not user-supplied email
        const email = user?.email || 'user@example.com';
        const results = await runSystemOnboarding(files, email);

        return NextResponse.json({
            success: true,
            message: 'Magic onboarding complete',
            data: results
        });
    } catch (error) {
        console.error('[Onboarding API] Error:', error);
        return NextResponse.json(
            { success: false, error: 'Onboarding failed' },
            { status: 500 }
        );
    }
}
