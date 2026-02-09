import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { parseDocument } from '@/lib/services/reductoService';
import { classifyDocumentFast, FastDocumentClassification } from '@/lib/services/aiService';
import { saveFile } from '@/lib/services/fileStorage';
import { reconcileDocumentLinks } from '@/lib/services/autoAttachService';
import { requireAuth } from '@/lib/auth-helpers';
import { rateLimit } from '@/lib/rate-limit';
import {
  MONGODB_SAFE_SIZE,
  validateUploadPayload,
  base64ToByteSize,
  extractEntriesFromResult,
  updateLinkedRecords,
  markDocumentFailed,
  markDocumentComplete,
  updateDocumentProgress,
  resolveParseType,
} from '@/lib/services/documentUploadHelpers';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    const rateLimited = rateLimit(`doc-upload:${userId}`, { maxRequests: 20, windowSeconds: 60 });
    if (rateLimited) return rateLimited;

    // Parse body (use text() to handle larger payloads)
    let body;
    try {
      const rawBody = await request.text();
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Failed to parse request. File may be too large (max 50MB).' },
        { status: 400 }
      );
    }

    // Validate
    const validationError = validateUploadPayload(body);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const { fileBase64, fileType, documentType: requestedDocType, aircraftId, pilotId, filename, skipAnalysis } = body;
    const fileSizeBytes = base64ToByteSize(fileBase64.length);

    await dbConnect();

    const originalFilename = filename || `document_${Date.now()}.${fileType === 'pdf' ? 'pdf' : 'png'}`;
    const isLargeFile = fileBase64.length > MONGODB_SAFE_SIZE;

    // ---- Parallel: classify + save file to disk ----
    let analysis: FastDocumentClassification | null = null;
    let documentType = requestedDocType || 'other';
    let suggestedName = originalFilename;

    const [classificationResult, storedFile] = await Promise.all([
      !skipAnalysis
        ? classifyDocumentFast(fileBase64, fileType).catch(err => {
            console.error('Classification error:', err);
            return { success: false, error: err.message };
          })
        : Promise.resolve({ success: false }),
      saveFile(fileBase64, originalFilename, fileType, 'other').catch(err => {
        console.error('File save error:', err);
        return null;
      }),
    ]);

    // Process classification result
    if (
      !skipAnalysis &&
      classificationResult.success &&
      'classification' in classificationResult &&
      classificationResult.classification
    ) {
      analysis = classificationResult.classification as FastDocumentClassification;

      // Lower confidence for logbook types (harder to classify from scans)
      const logbookTypes = ['pilot_logbook', 'aircraft_logbook', 'logbook'];
      const confidenceThreshold = logbookTypes.includes(analysis.detectedType) ? 0.5 : 0.7;

      // Map legacy 'logbook' type
      if (analysis.detectedType === 'logbook') {
        const hasMultipleTails = analysis.aircraftTailNumbers && analysis.aircraftTailNumbers.length > 1;
        const hasPilotName = !!analysis.pilotName || !!analysis.matchedPilotName;
        if (hasMultipleTails || hasPilotName || analysis.estimatedEntryCount > 5) {
          analysis.detectedType = 'pilot_logbook';
        }
      }

      if (analysis.confidence >= confidenceThreshold && analysis.detectedType !== 'unknown') {
        documentType = analysis.detectedType;
      }
      if (analysis.suggestedName) {
        suggestedName = analysis.suggestedName;
      }
    }

    // ---- Create document record ----
    const doc = await ParsedDocument.create({
      userId,
      filename: suggestedName,
      originalFilename,
      documentType,
      fileType,
      status: isLargeFile ? 'parsing' : 'pending',
      progress: isLargeFile ? 10 : 0,
      progressStep: isLargeFile ? 'queued' : 'pending',
      retryCount: 0,
      aircraft: aircraftId || undefined,
      pilot: pilotId || undefined,
      analysis: analysis || undefined,
      filePath: storedFile?.relativePath,
      fileSize: storedFile?.size || fileSizeBytes,
    });

    // Auto-reconcile if no explicit links
    if (!aircraftId && !pilotId) {
      try {
        await reconcileDocumentLinks(doc._id.toString());
      } catch (reconError) {
        console.error('Auto-reconciliation error:', reconError);
      }
    }

    // ---- Large files: parse immediately ----
    if (isLargeFile) {
      try {
        await updateDocumentProgress(doc._id.toString(), 30, 'uploading', 'parsing');
        await updateDocumentProgress(doc._id.toString(), 50, 'processing');

        const result = await parseDocument(fileBase64, fileType, resolveParseType(documentType));

        await updateDocumentProgress(doc._id.toString(), 80, 'extracting');

        if (!result.success) {
          await markDocumentFailed(doc._id.toString(), result.error || 'Parse failed');
          return NextResponse.json(
            { success: false, error: result.error, documentId: doc._id },
            { status: 500 }
          );
        }

        const entries = extractEntriesFromResult(result);
        const { summary } = await markDocumentComplete(doc._id.toString(), {
          entries,
          rawOutput: result.data?.extractedData,
          documentType,
        });

        await updateLinkedRecords({ pilotId, aircraftId, documentType, entries });

        return NextResponse.json({
          success: true,
          data: {
            documentId: doc._id,
            filename: doc.filename,
            originalFilename: doc.originalFilename,
            documentType,
            status: 'completed',
            progress: 100,
            progressStep: 'complete',
            message: 'Document parsed successfully.',
            summary,
            analysis: analysis || undefined,
            filePath: storedFile?.relativePath,
          },
        });
      } catch (parseError) {
        console.error('Large file parse error:', parseError);
        await markDocumentFailed(doc._id.toString(), (parseError as Error).message);
        return NextResponse.json(
          { success: false, error: (parseError as Error).message, documentId: doc._id },
          { status: 500 }
        );
      }
    }

    // ---- Small files: store and return (client triggers parsing separately) ----
    return NextResponse.json({
      success: true,
      data: {
        documentId: doc._id,
        filename: doc.filename,
        originalFilename: doc.originalFilename,
        documentType,
        status: 'pending',
        progress: 0,
        progressStep: 'pending',
        message: 'File uploaded successfully. Ready for parsing.',
        analysis: analysis || undefined,
        filePath: storedFile?.relativePath,
      },
    });
  } catch (error) {
    console.error('Document upload error:', error);
    return NextResponse.json(
      { success: false, error: 'Document upload failed' },
      { status: 500 }
    );
  }
}
