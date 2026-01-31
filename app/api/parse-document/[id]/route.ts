import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import Aircraft from '@/lib/models/Aircraft';
import Pilot from '@/lib/models/Pilot';

// GET: Get a single parsed document with full data
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        await dbConnect();
        const doc = await ParsedDocument.findById(params.id)
            .populate('aircraft', 'tailNumber model')
            .lean();

        if (!doc) {
            return NextResponse.json(
                { success: false, error: 'Document not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, data: doc });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: (error as Error).message },
            { status: 500 }
        );
    }
}

// PATCH: Update document (link to aircraft, pilot, etc.)
export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        await dbConnect();
        const body = await request.json();
        const { aircraftId, pilotId } = body;

        // Get current document to check existing links
        const currentDoc = await ParsedDocument.findById(params.id);
        if (!currentDoc) {
            return NextResponse.json(
                { success: false, error: 'Document not found' },
                { status: 404 }
            );
        }

        const update: Record<string, any> = {};

        // Handle aircraft linking/unlinking
        if (aircraftId !== undefined) {
            const newAircraftId = aircraftId || null;
            const oldAircraftId = currentDoc.aircraft?.toString();

            update.aircraft = newAircraftId;

            // Remove from old aircraft's linkedDocuments
            if (oldAircraftId && oldAircraftId !== newAircraftId) {
                await Aircraft.findByIdAndUpdate(oldAircraftId, {
                    $pull: { linkedDocuments: params.id }
                });
            }

            // Add to new aircraft's linkedDocuments
            if (newAircraftId && newAircraftId !== oldAircraftId) {
                await Aircraft.findByIdAndUpdate(newAircraftId, {
                    $addToSet: { linkedDocuments: params.id }
                });
            }
        }

        // Handle pilot linking/unlinking
        if (pilotId !== undefined) {
            const newPilotId = pilotId || null;
            const oldPilotId = currentDoc.pilot?.toString();

            update.pilot = newPilotId;

            // Remove from old pilot's linkedDocuments
            if (oldPilotId && oldPilotId !== newPilotId) {
                await Pilot.findByIdAndUpdate(oldPilotId, {
                    $pull: { linkedDocuments: params.id }
                });
            }

            // Add to new pilot's linkedDocuments
            if (newPilotId && newPilotId !== oldPilotId) {
                await Pilot.findByIdAndUpdate(newPilotId, {
                    $addToSet: { linkedDocuments: params.id }
                });
            }
        }

        const doc = await ParsedDocument.findByIdAndUpdate(
            params.id,
            { $set: update },
            { new: true }
        ).populate('aircraft', 'tailNumber model')
         .populate('pilot', 'name email')
         .lean();

        return NextResponse.json({ success: true, data: doc });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: (error as Error).message },
            { status: 500 }
        );
    }
}

// DELETE: Remove a parsed document
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        await dbConnect();
        await ParsedDocument.findByIdAndDelete(params.id);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: (error as Error).message },
            { status: 500 }
        );
    }
}
