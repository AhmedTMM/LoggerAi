import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { parseDocument } from '@/lib/services/reductoService';
import { classifyDocumentFast, FastDocumentClassification } from '@/lib/services/aiService';
import { saveFile } from '@/lib/services/fileStorage';
import { reconcileDocumentLinks } from '@/lib/services/reconciliationService';
import { requireAuth } from '@/lib/auth-helpers';
import { calculateSummary, updateAircraftFromEntries, updatePilotExperience } from '@/lib/services/documentProcessingUtils';
import { rateLimit } from '@/lib/rate-limit';

// Allow longer timeout for large file processing
export const maxDuration = 300;

// MongoDB has a 16MB document limit. Base64 adds ~33% overhead.
// So files over ~10MB base64 (~7.5MB actual) should be parsed immediately.
const MONGODB_SAFE_SIZE = 10 * 1024 * 1024; // 10MB base64

// Upload endpoint - handles both small files (store for later) and large files (parse inline)
export async function POST(request: NextRequest) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    // Rate limit uploads: 20 per minute per user
    const rateLimited = rateLimit(`doc-upload:${userId}`, { maxRequests: 20, windowSeconds: 60 });
    if (rateLimited) return rateLimited;

    // Use text() instead of json() to handle larger payloads
    let body;
    try {
      const rawBody = await request.text();
      body = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('Body parse error:', parseError);
      return NextResponse.json(
        { success: false, error: 'Failed to parse request. File may be too large (max 50MB).' },
        { status: 400 }
      );
    }

    const { fileBase64, fileType, documentType: requestedDocType, aircraftId, pilotId, filename, skipAnalysis } = body;

    if (!fileBase64 || !fileType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: fileBase64, fileType' },
        { status: 400 }
      );
    }

    // Validate fileType to prevent arbitrary file uploads
    const allowedFileTypes = ['pdf', 'image'];
    if (!allowedFileTypes.includes(fileType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Allowed: pdf, image' },
        { status: 400 }
      );
    }

    // Validate file size (base64 is ~33% larger than binary)
    const fileSizeBytes = Math.ceil((fileBase64.length * 3) / 4);
    const maxSizeBytes = 50 * 1024 * 1024; // 50MB actual file limit

    if (fileSizeBytes > maxSizeBytes) {
      return NextResponse.json(
        { success: false, error: `File too large. Maximum size is 50MB. Your file is ${Math.round(fileSizeBytes / 1024 / 1024)}MB` },
        { status: 400 }
      );
    }

    await dbConnect();

    const originalFilename = filename || `document_${Date.now()}.${fileType === 'pdf' ? 'pdf' : 'png'}`;
    const isLargeFile = fileBase64.length > MONGODB_SAFE_SIZE;

    // ULTRA-FAST PARALLEL: Run classification + file save simultaneously
    let analysis: FastDocumentClassification | null = null;
    let documentType = requestedDocType || 'other';
    let suggestedName = originalFilename;
    let storedFile: { relativePath: string; size: number } | null = null;

    // Run classification and file save in parallel (always save to disk for reliability)
    const [classificationResult, savedFile] = await Promise.all([
      // Classification (skip if requested)
      !skipAnalysis ? classifyDocumentFast(fileBase64, fileType).catch(err => {
        console.error('Classification error:', err);
        return { success: false, error: err.message };
      }) : Promise.resolve({ success: false }),
      // Always save file to disk (avoids storing base64 in MongoDB)
      saveFile(fileBase64, originalFilename, fileType, 'other').catch(err => {
        console.error('File save error:', err);
        return null;
      })
    ]);

    storedFile = savedFile;

    if (!skipAnalysis && classificationResult.success && 'classification' in classificationResult && classificationResult.classification) {
      analysis = classificationResult.classification as FastDocumentClassification;

      // Lower confidence threshold for logbook types (they're harder to classify from scans)
      const logbookTypes = ['pilot_logbook', 'aircraft_logbook', 'logbook'];
      const isLogbookType = logbookTypes.includes(analysis.detectedType);
      const confidenceThreshold = isLogbookType ? 0.5 : 0.7;

      // Map legacy 'logbook' type to 'pilot_logbook' if it looks like pilot logbook
      if (analysis.detectedType === 'logbook') {
        const hasMultipleTails = analysis.aircraftTailNumbers && analysis.aircraftTailNumbers.length > 1;
        const hasPilotName = !!analysis.pilotName || !!analysis.matchedPilotName;
        if (hasMultipleTails || hasPilotName || analysis.estimatedEntryCount > 5) {
          analysis.detectedType = 'pilot_logbook';
        }
      }

      // Use detected type if confidence is high enough
      if (analysis.confidence >= confidenceThreshold && analysis.detectedType !== 'unknown') {
        documentType = analysis.detectedType;
      }
      if (analysis.suggestedName) {
        suggestedName = analysis.suggestedName;
      }
    }

    // Create document record
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

    // Step 3: Auto-reconcile document with pilot/aircraft
    if (!aircraftId && !pilotId) {
      try {
        await reconcileDocumentLinks(doc._id.toString());
      } catch (reconError) {
        console.error('Auto-reconciliation error:', reconError);
      }
    }

    // For large files, parse immediately instead of storing
    if (isLargeFile) {
      try {
        // Update progress: uploading to Reducto
        await ParsedDocument.findByIdAndUpdate(doc._id, {
          progress: 30,
          progressStep: 'uploading',
        });

        // Update progress: processing
        await ParsedDocument.findByIdAndUpdate(doc._id, {
          progress: 50,
          progressStep: 'processing',
        });

        // POH documents are treated as logbooks for extraction purposes
        const parseType = documentType === 'poh' ? 'logbook' : documentType;
        const result = await parseDocument(fileBase64, fileType, parseType);

        // Update progress: extracting
        await ParsedDocument.findByIdAndUpdate(doc._id, {
          progress: 80,
          progressStep: 'extracting',
        });

        if (!result.success) {
          await ParsedDocument.findByIdAndUpdate(doc._id, {
            status: 'failed',
            progress: 0,
            progressStep: 'failed',
            error: result.error,
          });
          return NextResponse.json(
            { success: false, error: result.error, documentId: doc._id },
            { status: 500 }
          );
        }

        // Extract entries from result
        const entries = result.data?.extractedData?.entries ||
          (Array.isArray(result.data?.extractedData) ? result.data?.extractedData : []);

        const summary = calculateSummary(entries);

        // Update document with parsed data
        await ParsedDocument.findByIdAndUpdate(doc._id, {
          status: 'completed',
          progress: 100,
          progressStep: 'complete',
          parsedAt: new Date(),
          rawOutput: result.data?.extractedData,
          entries,
          summary,
        });

        // PARALLEL: Update linked aircraft AND pilot simultaneously
        const dbUpdatePromises: Promise<void>[] = [];
        const aircraftDocTypes = ['aircraft_logbook', 'maintenance', 'inspection'];
        if (aircraftId && aircraftDocTypes.includes(documentType) && entries.length > 0) {
          dbUpdatePromises.push(updateAircraftFromEntries(aircraftId, entries));
        }
        const pilotDocTypes = ['pilot_logbook', 'logbook'];
        if (pilotId && pilotDocTypes.includes(documentType) && entries.length > 0) {
          dbUpdatePromises.push(updatePilotExperience(pilotId, entries));
        }
        if (dbUpdatePromises.length > 0) {
          await Promise.all(dbUpdatePromises);
        }

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
        await ParsedDocument.findByIdAndUpdate(doc._id, {
          status: 'failed',
          progress: 0,
          progressStep: 'failed',
          error: (parseError as Error).message,
        });
        return NextResponse.json(
          { success: false, error: (parseError as Error).message, documentId: doc._id },
          { status: 500 }
        );
      }
    }

    // For small files, just store and return - client can trigger parsing separately
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

