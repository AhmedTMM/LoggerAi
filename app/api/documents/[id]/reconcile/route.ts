import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { reconcileDocumentLinks } from '@/lib/services/reconciliationService';

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        await dbConnect();
        const { id } = params;

        const result = await reconcileDocumentLinks(id);

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            data: result,
            message: result.pilotLinked || result.aircraftLinked
                ? 'Entities matched and linked successfully.'
                : 'No matching entities found.'
        });

    } catch (error) {
        console.error('[Reconcile API] Error:', error);
        return NextResponse.json(
            { success: false, error: (error as Error).message },
            { status: 500 }
        );
    }
}
