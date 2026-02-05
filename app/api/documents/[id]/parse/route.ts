import { NextRequest, NextResponse } from 'next/server';
import { parseDocumentUltraFast } from '@/lib/services/reductoService';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { readFileAsBase64, fileExists } from '@/lib/services/fileStorage';
import {
  calculateSummary,
  updatePilotExperience,
  updateAircraftFromEntries
} from '@/lib/services/documentProcessingUtils';

// Increase timeout to 5 minutes for large document processing
export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Helper to update document progress
async function updateProgress(docId: string, progress: number, progressStep: string, status?: string) {
  const update: Record<string, any> = { progress, progressStep };
  if (status) update.status = status;
  await ParsedDocument.findByIdAndUpdate(docId, update);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: docId } = await context.params;

  try {
    await dbConnect();

    const doc = await ParsedDocument.findById(docId);
    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    // Check if already parsing or completed
    if (doc.status === 'parsing') {
      return NextResponse.json(
        { success: false, error: 'Document is already being parsed' },
        { status: 400 }
      );
    }

    if (doc.status === 'completed') {
      return NextResponse.json(
        { success: false, error: 'Document has already been parsed' },
        { status: 400 }
      );
    }

    // Check if file data exists (either on disk or base64)
    let fileBase64 = doc.fileBase64;

    // Try to load from disk if we have a file path
    if (!fileBase64 && doc.filePath) {
      const exists = await fileExists(doc.filePath);
      if (exists) {
        try {
          fileBase64 = await readFileAsBase64(doc.filePath);
        } catch (readError) {
          console.error('Error reading file from disk:', readError);
        }
      }
    }

    if (!fileBase64) {
      return NextResponse.json(
        { success: false, error: 'No file data found. Please re-upload the document.' },
        { status: 400 }
      );
    }

    // Increment retry count if this is a retry
    if (doc.status === 'failed') {
      doc.retryCount = (doc.retryCount || 0) + 1;
    }

    // Start parsing
    doc.status = 'parsing';
    doc.progress = 10;
    doc.progressStep = 'queued';
    doc.error = undefined;
    await doc.save();

    try {
      // Progress: 30% - Uploading to Reducto
      await updateProgress(docId, 30, 'uploading', 'parsing');

      // Progress: 50% - Processing document
      await updateProgress(docId, 50, 'processing');

      // Use ultra-fast direct Gemini vision extraction
      // POH documents are treated as logbooks for extraction purposes
      const parseType = doc.documentType === 'poh' ? 'logbook' : doc.documentType;
      const result = await parseDocumentUltraFast(fileBase64, doc.fileType, parseType);

      // Progress: 80% - Extracting entries
      await updateProgress(docId, 80, 'extracting');

      if (!result.success) {
        await ParsedDocument.findByIdAndUpdate(docId, {
          status: 'failed',
          progress: 0,
          progressStep: 'failed',
          error: result.error,
        });
        return NextResponse.json(
          { success: false, error: result.error, documentId: docId },
          { status: 500 }
        );
      }

      // Extract entries from result
      const entries = result.data?.extractedData?.entries ||
        (Array.isArray(result.data?.extractedData) ? result.data?.extractedData : []);

      // Calculate summary
      const summary = calculateSummary(entries);

      // Update document with parsed data
      await ParsedDocument.findByIdAndUpdate(docId, {
        status: 'completed',
        progress: 100,
        progressStep: 'complete',
        parsedAt: new Date(),
        rawOutput: result.data?.extractedData,
        entries,
        summary,
        fileBase64: undefined, // Clear stored file to save space
      });

      // Update linked records in parallel
      const updatePromises: Promise<void>[] = [];

      // Update linked aircraft if maintenance/inspection type
      const aircraftDocTypes = ['aircraft_logbook', 'maintenance', 'inspection'];
      if (doc.aircraft && aircraftDocTypes.includes(doc.documentType) && entries.length > 0) {
        updatePromises.push(updateAircraftFromEntries(doc.aircraft.toString(), entries));
      }

      // Update linked pilot if logbook type
      const pilotDocTypes = ['pilot_logbook', 'logbook'];
      if (doc.pilot && pilotDocTypes.includes(doc.documentType) && entries.length > 0) {
        updatePromises.push(updatePilotExperience(doc.pilot.toString(), entries));
      }

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
      }

      return NextResponse.json({
        success: true,
        data: {
          documentId: docId,
          status: 'completed',
          progress: 100,
          progressStep: 'complete',
          entries,
          summary,
        },
      });
    } catch (parseError) {
      console.error('Parse error:', parseError);
      await ParsedDocument.findByIdAndUpdate(docId, {
        status: 'failed',
        progress: 0,
        progressStep: 'failed',
        error: (parseError as Error).message,
      });
      return NextResponse.json(
        { success: false, error: (parseError as Error).message },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Document parse trigger error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// GET: Check parsing status/progress
export async function GET(request: NextRequest, context: RouteContext) {
  const { id: docId } = await context.params;

  try {
    await dbConnect();

    const doc = await ParsedDocument.findById(docId)
      .select('status progress progressStep error summary entries filename documentType')
      .lean();

    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: doc,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

