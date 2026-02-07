import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import mongoose from 'mongoose';
import { parseDocumentUltraFast } from '@/lib/services/reductoService';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { readFileAsBase64, fileExists } from '@/lib/services/fileStorage';
import {
  extractEntriesFromResult,
  updateLinkedRecords,
  markDocumentFailed,
  markDocumentComplete,
  updateDocumentProgress,
  resolveParseType,
} from '@/lib/services/documentUploadHelpers';

export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: docId } = await context.params;

  const { error, userId } = await requireAuth();
  if (error) return error;

  if (!mongoose.Types.ObjectId.isValid(docId)) {
    return NextResponse.json(
      { success: false, error: 'Invalid document ID' },
      { status: 400 }
    );
  }

  try {
    await dbConnect();

    const doc = await ParsedDocument.findOne({ _id: docId, userId });
    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

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

    // Load file data from disk or inline base64
    let fileBase64 = doc.fileBase64;
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

    // Increment retry count if retrying a failed parse
    if (doc.status === 'failed') {
      doc.retryCount = (doc.retryCount || 0) + 1;
    }

    doc.status = 'parsing';
    doc.progress = 10;
    doc.progressStep = 'queued';
    doc.error = undefined;
    await doc.save();

    try {
      await updateDocumentProgress(docId, 30, 'uploading', 'parsing', userId);
      await updateDocumentProgress(docId, 50, 'processing', undefined, userId);

      const result = await parseDocumentUltraFast(fileBase64, doc.fileType, resolveParseType(doc.documentType));

      await updateDocumentProgress(docId, 80, 'extracting', undefined, userId);

      if (!result.success) {
        await markDocumentFailed(docId, result.error || 'Parse failed', userId);
        return NextResponse.json(
          { success: false, error: 'Failed to parse document', documentId: docId },
          { status: 500 }
        );
      }

      const entries = extractEntriesFromResult(result);
      const { summary } = await markDocumentComplete(docId, {
        entries,
        rawOutput: result.data?.extractedData,
        documentType: doc.documentType,
      }, userId);

      // Clear stored base64 to save space
      await ParsedDocument.findOneAndUpdate({ _id: docId, userId }, { fileBase64: undefined });

      await updateLinkedRecords({
        pilotId: doc.pilot?.toString(),
        aircraftId: doc.aircraft?.toString(),
        documentType: doc.documentType,
        entries,
      });

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
      await markDocumentFailed(docId, (parseError as Error).message, userId);
      return NextResponse.json(
        { success: false, error: 'Failed to parse document' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Document parse trigger error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to parse document' },
      { status: 500 }
    );
  }
}

// GET: Check parsing status/progress
export async function GET(request: NextRequest, context: RouteContext) {
  const { id: docId } = await context.params;

  const { error, userId } = await requireAuth();
  if (error) return error;

  if (!mongoose.Types.ObjectId.isValid(docId)) {
    return NextResponse.json(
      { success: false, error: 'Invalid document ID' },
      { status: 400 }
    );
  }

  try {
    await dbConnect();

    const doc = await ParsedDocument.findOne({ _id: docId, userId })
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
      { success: false, error: 'Failed to fetch document status' },
      { status: 500 }
    );
  }
}
