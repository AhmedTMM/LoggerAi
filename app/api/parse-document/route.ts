import { NextRequest, NextResponse } from 'next/server';
import { parseDocumentUltraFast } from '@/lib/services/reductoService';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { requireAuth } from '@/lib/auth-helpers';
import {
  calculateSummary,
  updatePilotExperience,
  updateAircraftFromEntries
} from '@/lib/services/documentProcessingUtils';

export async function POST(request: NextRequest) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    const body = await request.json();
    const { fileBase64, fileType, documentType, aircraftId, pilotId, filename, background } = body;

    if (!fileBase64 || !fileType || !documentType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: fileBase64, fileType, documentType' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Create a pending document record
    const doc = await ParsedDocument.create({
      userId,
      filename: filename || `${documentType}_${Date.now()}.${fileType}`,
      documentType,
      fileType,
      status: 'pending',
      aircraft: aircraftId || undefined,
      pilot: pilotId || undefined,
      fileBase64: background ? fileBase64 : undefined, // Store for background re-parsing if needed
    });

    // If background mode, return immediately with doc ID
    if (background) {
      // Fire off parsing in background (not awaited)
      processDocumentInBackground(doc._id.toString(), fileBase64, fileType, documentType, aircraftId, pilotId);

      return NextResponse.json({
        success: true,
        data: { documentId: doc._id, status: 'pending', message: 'Parsing started in background' },
      });
    }

    // Synchronous parsing
    doc.status = 'parsing';
    await doc.save();

    // Use ultra-fast direct Gemini vision extraction
    const result = await parseDocumentUltraFast(fileBase64, fileType, documentType);

    if (!result.success) {
      doc.status = 'failed';
      doc.error = result.error;
      await doc.save();
      return NextResponse.json(
        { success: false, error: result.error, documentId: doc._id },
        { status: 500 }
      );
    }

    // Save parsed results
    const entries = result.data?.extractedData?.entries ||
      (Array.isArray(result.data?.extractedData) ? result.data?.extractedData : []);

    doc.status = 'completed';
    doc.parsedAt = new Date();
    doc.rawOutput = result.data?.extractedData;
    doc.entries = entries;
    doc.summary = calculateSummary(entries);
    await doc.save();

    // Update linked records in parallel
    const updatePromises: Promise<void>[] = [];

    const aircraftDocTypes = ['aircraft_logbook', 'maintenance', 'inspection'];
    if (aircraftId && aircraftDocTypes.includes(documentType) && entries.length > 0) {
      updatePromises.push(updateAircraftFromEntries(aircraftId, entries));
    }

    const pilotDocTypes = ['pilot_logbook', 'logbook'];
    if (pilotId && pilotDocTypes.includes(documentType) && entries.length > 0) {
      updatePromises.push(updatePilotExperience(pilotId, entries));
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    return NextResponse.json({
      success: true,
      data: {
        documentId: doc._id,
        entries,
        summary: doc.summary,
        rawOutput: doc.rawOutput,
      },
    });
  } catch (error) {
    console.error('Document parsing error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// GET: List all parsed documents
export async function GET(request: NextRequest) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const aircraftId = searchParams.get('aircraftId');
    const pilotId = searchParams.get('pilotId');
    const documentType = searchParams.get('documentType');
    const status = searchParams.get('status');

    const query: Record<string, any> = { userId };
    if (aircraftId) query.aircraft = aircraftId;
    if (pilotId) query.pilot = pilotId;
    if (documentType) query.documentType = documentType;
    if (status) query.status = status;

    const documents = await ParsedDocument.find(query)
      .select('-fileBase64 -rawOutput') // Don't send large fields in list
      .sort({ uploadedAt: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    console.error('Error fetching parsed documents:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// Background processing function
async function processDocumentInBackground(
  docId: string,
  fileBase64: string,
  fileType: 'pdf' | 'image',
  documentType: 'logbook' | 'maintenance' | 'poh',
  aircraftId?: string,
  pilotId?: string
) {
  try {
    await dbConnect();
    const doc = await ParsedDocument.findById(docId);
    if (!doc) return;

    doc.status = 'parsing';
    await doc.save();

    // Use ultra-fast direct Gemini vision extraction
    const result = await parseDocumentUltraFast(fileBase64, fileType, documentType as 'logbook' | 'maintenance');

    if (!result.success) {
      doc.status = 'failed';
      doc.error = result.error;
      await doc.save();
      return;
    }

    const entries = result.data?.extractedData?.entries ||
      (Array.isArray(result.data?.extractedData) ? result.data?.extractedData : []);

    doc.status = 'completed';
    doc.parsedAt = new Date();
    doc.rawOutput = result.data?.extractedData;
    doc.entries = entries;
    doc.summary = calculateSummary(entries);
    doc.fileBase64 = undefined; // Clear stored file after successful parse
    await doc.save();

    // Update linked records in parallel
    const bgUpdatePromises: Promise<void>[] = [];

    const bgAircraftDocTypes = ['aircraft_logbook', 'maintenance', 'inspection'];
    if (aircraftId && bgAircraftDocTypes.includes(documentType) && entries.length > 0) {
      bgUpdatePromises.push(updateAircraftFromEntries(aircraftId, entries));
    }

    const bgPilotDocTypes = ['pilot_logbook', 'logbook'];
    if (pilotId && bgPilotDocTypes.includes(documentType) && entries.length > 0) {
      bgUpdatePromises.push(updatePilotExperience(pilotId, entries));
    }

    if (bgUpdatePromises.length > 0) {
      await Promise.all(bgUpdatePromises);
    }
  } catch (error) {
    console.error('Background parsing error:', error);
    try {
      await ParsedDocument.findByIdAndUpdate(docId, {
        status: 'failed',
        error: (error as Error).message
      });
    } catch { }
  }
}

