import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import Pilot from '@/lib/models/Pilot';
import Aircraft from '@/lib/models/Aircraft';
import mongoose from 'mongoose';

/**
 * Reconciles a parsed document with Pilots and Aircraft based on AI analysis
 * @param docId The ID of the ParsedDocument to reconcile
 * @returns Object with linked entities
 */
export async function reconcileDocumentLinks(docId: string) {
    await dbConnect();

    const doc = await ParsedDocument.findById(docId);
    if (!doc || !doc.analysis) {
        return { success: false, error: 'Document or analysis not found' };
    }

    const { matchedPilotName, matchedAircraftTails } = doc.analysis as any;
    const updates: any = {};
    const results = {
        pilotLinked: false,
        aircraftLinked: false,
        pilotId: null as string | null,
        aircraftId: null as string | null
    };

    // 1. Reconcile Pilot
    if (matchedPilotName && !doc.pilot) {
        // Try exact match first
        let pilot = await Pilot.findOne({
            name: { $regex: new RegExp(`^${matchedPilotName}$`, 'i') }
        });

        // If no exact match, try fuzzy (starts with or contains if name is reasonably long)
        if (!pilot && matchedPilotName.length > 3) {
            pilot = await Pilot.findOne({
                name: { $regex: new RegExp(matchedPilotName, 'i') }
            });
        }

        if (pilot) {
            updates.pilot = pilot._id;
            results.pilotLinked = true;
            results.pilotId = pilot._id.toString();

            // Add to pilot's linked documents if not already there
            if (!pilot.linkedDocuments?.includes(doc._id as any)) {
                await Pilot.findByIdAndUpdate(pilot._id, {
                    $addToSet: { linkedDocuments: doc._id }
                });
            }
        }
    }

    // 2. Reconcile Aircraft
    if (matchedAircraftTails && matchedAircraftTails.length > 0 && !doc.aircraft) {
        const tailNumber = matchedAircraftTails[0].toUpperCase();
        // Normalize tail (ensure it starts with N for US-based logic if missing)
        const normalizedTail = tailNumber.startsWith('N') ? tailNumber : `N${tailNumber}`;

        const aircraft = await Aircraft.findOne({
            tailNumber: { $regex: new RegExp(`^${normalizedTail}$`, 'i') }
        });

        if (aircraft) {
            updates.aircraft = aircraft._id;
            results.aircraftLinked = true;
            results.aircraftId = aircraft._id.toString();
        }
    }

    // Apply updates to the document
    if (Object.keys(updates).length > 0) {
        await ParsedDocument.findByIdAndUpdate(docId, { $set: updates });
    }

    return { success: true, ...results };
}

/**
 * Runs reconciliation for all pending documents
 */
export async function reconcileAllPendingDocuments() {
    await dbConnect();

    const pendingDocs = await ParsedDocument.find({
        status: 'completed',
        $or: [
            { pilot: { $exists: false } },
            { aircraft: { $exists: false } }
        ],
        analysis: { $exists: true }
    });

    const results = [];
    for (const doc of pendingDocs) {
        const res = await reconcileDocumentLinks(doc._id.toString());
        results.push({ id: doc._id, ...res });
    }

    return results;
}
