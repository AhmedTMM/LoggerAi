import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import mongoose from 'mongoose';
import Pilot from '@/lib/models/Pilot';
import ParsedDocument from '@/lib/models/ParsedDocument';

// Helper to extract flight entries from a document
function extractEntriesFromDoc(doc: any) {
    let entries = doc.entries || [];

    // Handle nested flights structure
    if (entries.length === 1 && entries[0].flights) {
        entries = entries[0].flights;
    }

    return entries.map((e: any) => ({
        date: e.date || '',
        aircraftIdent: e.aircraftIdent || e.aircraft || '',
        aircraftType: e.aircraftType || '',
        from: e.from || '',
        to: e.to || '',
        route: e.route || '',
        totalTime: e.totalTime || e.duration || 0,
        pic: e.pic || 0,
        sic: e.sic || 0,
        solo: e.solo || 0,
        dualReceived: e.dualReceived || 0,
        dualGiven: e.dualGiven || 0,
        crossCountry: e.crossCountry || 0,
        night: e.night || 0,
        actualInstrument: e.actualInstrument || 0,
        simulatedInstrument: e.simulatedInstrument || 0,
        sel: e.sel || 0,
        mel: e.mel || 0,
        landingsDay: e.landingsFullStopDay || e.landingsDay || 0,
        landingsNight: e.landingsFullStopNight || e.landingsNight || 0,
        landingsTotal: e.landingsTotal || 0,
        remarks: e.remarks || '',
    })).filter((e: any) => e.date && e.aircraftIdent);
}

// Helper to recalculate experience from entries
function calculateExperience(flightEntries: any[]) {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let totalHours = 0, picHours = 0, nightHours = 0, ifrHours = 0, crossCountryHours = 0;
    let last90DaysHours = 0, last30DaysHours = 0;

    for (const entry of flightEntries) {
        totalHours += entry.totalTime || 0;
        picHours += entry.pic || 0;
        nightHours += entry.night || 0;
        ifrHours += (entry.actualInstrument || 0) + (entry.simulatedInstrument || 0);
        crossCountryHours += entry.crossCountry || 0;

        if (entry.date) {
            const entryDate = new Date(entry.date);
            if (!isNaN(entryDate.getTime())) {
                if (entryDate >= ninetyDaysAgo) last90DaysHours += entry.totalTime || 0;
                if (entryDate >= thirtyDaysAgo) last30DaysHours += entry.totalTime || 0;
            }
        }
    }

    return {
        totalHours: Math.round(totalHours * 10) / 10,
        picHours: Math.round(picHours * 10) / 10,
        nightHours: Math.round(nightHours * 10) / 10,
        ifrHours: Math.round(ifrHours * 10) / 10,
        crossCountryHours: Math.round(crossCountryHours * 10) / 10,
        last90DaysHours: Math.round(last90DaysHours * 10) / 10,
        last30DaysHours: Math.round(last30DaysHours * 10) / 10,
    };
}

// POST: Add a document to pilot's linked documents and recalculate
export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const { error, userId } = await requireAuth();
        if (error) return error;

        await dbConnect();
        const body = await request.json();
        const { documentId, action } = body;

        if (!mongoose.Types.ObjectId.isValid(params.id)) {
            return NextResponse.json(
                { success: false, error: 'Invalid pilot ID' },
                { status: 400 }
            );
        }

        if (!documentId) {
            return NextResponse.json(
                { success: false, error: 'documentId required' },
                { status: 400 }
            );
        }

        const pilot = await Pilot.findOne({ _id: params.id, userId });
        if (!pilot) {
            return NextResponse.json(
                { success: false, error: 'Pilot not found' },
                { status: 404 }
            );
        }

        const doc = await ParsedDocument.findById(documentId);
        if (!doc || doc.status !== 'completed') {
            return NextResponse.json(
                { success: false, error: 'Document not found or not completed' },
                { status: 404 }
            );
        }

        // Initialize linkedDocuments if not exists
        if (!pilot.linkedDocuments) {
            pilot.linkedDocuments = [];
        }

        const docIdString = doc._id.toString();
        const isLinked = pilot.linkedDocuments.some((id: any) => id.toString() === docIdString);

        if (action === 'remove') {
            // Remove document from linked list
            pilot.linkedDocuments = pilot.linkedDocuments.filter((id: any) => id.toString() !== docIdString);
            doc.pilot = undefined;
        } else {
            // Add document to linked list (if not already linked)
            if (!isLinked) {
                pilot.linkedDocuments.push(doc._id);
            }
            doc.pilot = pilot._id;
        }

        // Now aggregate all entries from ALL linked documents
        const allLinkedDocs = await ParsedDocument.find({
            _id: { $in: pilot.linkedDocuments },
            status: 'completed'
        });

        let allEntries: any[] = [];
        for (const linkedDoc of allLinkedDocs) {
            const entries = extractEntriesFromDoc(linkedDoc);
            allEntries = allEntries.concat(entries);
        }

        // Sort by date
        allEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Update pilot
        pilot.flightEntries = allEntries;
        pilot.experience = calculateExperience(allEntries);

        await doc.save();
        await pilot.save();

        return NextResponse.json({
            success: true,
            data: pilot,
            message: action === 'remove'
                ? `Removed document. ${allEntries.length} total entries from ${pilot.linkedDocuments.length} documents.`
                : `Added document. ${allEntries.length} total entries from ${pilot.linkedDocuments.length} documents.`
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: 'Failed to apply logbook' },
            { status: 500 }
        );
    }
}
