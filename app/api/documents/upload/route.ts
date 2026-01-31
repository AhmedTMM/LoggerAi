import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import Aircraft from '@/lib/models/Aircraft';
import Pilot from '@/lib/models/Pilot';
import { parseDocument } from '@/lib/services/reductoService';
import { classifyDocumentFast, FastDocumentClassification } from '@/lib/services/aiService';
import { saveFile } from '@/lib/services/fileStorage';
import { reconcileDocumentLinks } from '@/lib/services/reconciliationService';

// Allow longer timeout for large file processing
export const maxDuration = 300;

// MongoDB has a 16MB document limit. Base64 adds ~33% overhead.
// So files over ~10MB base64 (~7.5MB actual) should be parsed immediately.
const MONGODB_SAFE_SIZE = 10 * 1024 * 1024; // 10MB base64

// Upload endpoint - handles both small files (store for later) and large files (parse inline)
export async function POST(request: NextRequest) {
  try {
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

    // Run classification and file save in parallel
    const [classificationResult, savedFile] = await Promise.all([
      // Classification (skip if requested)
      !skipAnalysis ? classifyDocumentFast(fileBase64, fileType).catch(err => {
        console.error('Classification error:', err);
        return { success: false, error: err.message };
      }) : Promise.resolve({ success: false }),
      // File save for large files
      isLargeFile ? saveFile(fileBase64, originalFilename, fileType, 'other').catch(err => {
        console.error('File save error:', err);
        return null;
      }) : Promise.resolve(null)
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
      // Only store base64 for small files if file storage failed
      fileBase64: (!storedFile && !isLargeFile) ? fileBase64 : undefined,
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
        if (aircraftId && documentType === 'maintenance' && entries.length > 0) {
          dbUpdatePromises.push(updateAircraftFromParsedData(aircraftId, entries, result.data?.extractedData));
        }
        if (pilotId && documentType === 'logbook') {
          dbUpdatePromises.push(updatePilotFromParsedData(pilotId, entries));
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
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

function calculateSummary(entries: any[]) {
  if (!entries || entries.length === 0) {
    return { totalEntries: 0 };
  }

  const totalHours = entries.reduce((sum, e) => sum + (e.totalTime || e.duration || 0), 0);
  const dates = entries
    .map(e => e.date)
    .filter(Boolean)
    .sort();

  return {
    totalEntries: entries.length,
    totalHours: Math.round(totalHours * 10) / 10,
    dateRange: dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : undefined,
  };
}

async function updateAircraftFromParsedData(
  aircraftId: string,
  entries: any[],
  extractedData: any
) {
  const aircraft = await Aircraft.findById(aircraftId);
  if (!aircraft) return;

  // Add maintenance entries to logs
  const newLogs = entries.map((entry: any) => {
    const log: any = {
      date: entry.date ? new Date(entry.date) : new Date(),
      description: entry.description || entry.workPerformed || 'Maintenance entry',
      mechanic: entry.mechanic || entry.signedBy,
    };

    if (entry.hobbsTime != null && !isNaN(entry.hobbsTime)) {
      log.hobbsTime = entry.hobbsTime;
    }
    if (entry.tachTime != null && !isNaN(entry.tachTime)) {
      log.tachTime = entry.tachTime;
    }
    if (entry.certificateNumber) {
      log.certificateNumber = entry.certificateNumber;
    }

    return log;
  }).filter(log => log.description && log.description !== 'Maintenance entry');

  if (newLogs.length > 0) {
    aircraft.logs.push(...newLogs);
  }

  // Extract maintenance dates from entries
  let latestAnnual: Date | null = null;
  let latestTransponder: Date | null = null;
  let latestStatic: Date | null = null;
  let latestHundredHour: Date | null = null;
  let maxHobbs = aircraft.currentHours.hobbs;
  let maxTach = aircraft.currentHours.tach;

  for (const entry of entries) {
    const entryDate = entry.date ? new Date(entry.date) : null;

    if (entry.isInspection && entryDate) {
      if (entry.inspectionType === 'annual') {
        if (!latestAnnual || entryDate > latestAnnual) latestAnnual = entryDate;
      } else if (entry.inspectionType === '100hour') {
        if (!latestHundredHour || entryDate > latestHundredHour) latestHundredHour = entryDate;
      } else if (entry.inspectionType === 'transponder') {
        if (!latestTransponder || entryDate > latestTransponder) latestTransponder = entryDate;
      } else if (entry.inspectionType === 'static') {
        if (!latestStatic || entryDate > latestStatic) latestStatic = entryDate;
      }
    }

    const desc = (entry.description || '').toLowerCase();
    if (entryDate) {
      if (desc.includes('annual inspection') || desc.includes('annual insp')) {
        if (!latestAnnual || entryDate > latestAnnual) latestAnnual = entryDate;
      }
      if (desc.includes('100 hour') || desc.includes('100hr') || desc.includes('100-hour')) {
        if (!latestHundredHour || entryDate > latestHundredHour) latestHundredHour = entryDate;
      }
      if (desc.includes('transponder') && (desc.includes('91.413') || desc.includes('check'))) {
        if (!latestTransponder || entryDate > latestTransponder) latestTransponder = entryDate;
      }
      if (desc.includes('static') && desc.includes('91.411')) {
        if (!latestStatic || entryDate > latestStatic) latestStatic = entryDate;
      }
    }

    if (entry.hobbsTime && entry.hobbsTime > maxHobbs) maxHobbs = entry.hobbsTime;
    if (entry.tachTime && entry.tachTime > maxTach) maxTach = entry.tachTime;
  }

  if (latestAnnual) aircraft.maintenanceDates.annual = latestAnnual;
  if (latestTransponder) aircraft.maintenanceDates.transponder = latestTransponder;
  if (latestStatic) aircraft.maintenanceDates.staticSystem = latestStatic;
  if (latestHundredHour) aircraft.maintenanceDates.hundredHour = latestHundredHour;

  if (extractedData?.annualDate) {
    aircraft.maintenanceDates.annual = new Date(extractedData.annualDate);
  }
  if (extractedData?.transponderDate) {
    aircraft.maintenanceDates.transponder = new Date(extractedData.transponderDate);
  }
  if (extractedData?.staticSystemDate) {
    aircraft.maintenanceDates.staticSystem = new Date(extractedData.staticSystemDate);
  }

  if (maxHobbs > aircraft.currentHours.hobbs) {
    aircraft.currentHours.hobbs = maxHobbs;
  }
  if (maxTach > aircraft.currentHours.tach) {
    aircraft.currentHours.tach = maxTach;
  }

  await aircraft.save();
}

async function updatePilotFromParsedData(pilotId: string, entries: any[]) {
  const pilot = await Pilot.findById(pilotId);
  if (!pilot) return;

  let flatEntries = entries;
  if (entries.length === 1 && entries[0].flights) {
    flatEntries = entries[0].flights;
  }

  const flightEntries = flatEntries.map((e: any) => ({
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

  pilot.flightEntries = flightEntries;

  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let totalHours = 0, picHours = 0, nightHours = 0, ifrHours = 0, crossCountryHours = 0;
  let last90DaysHours = 0, last30DaysHours = 0;

  for (const entry of flightEntries) {
    totalHours += entry.totalTime;
    picHours += entry.pic || 0;
    nightHours += entry.night || 0;
    ifrHours += (entry.actualInstrument || 0) + (entry.simulatedInstrument || 0);
    crossCountryHours += entry.crossCountry || 0;

    if (entry.date) {
      const entryDate = new Date(entry.date);
      if (!isNaN(entryDate.getTime())) {
        if (entryDate >= ninetyDaysAgo) last90DaysHours += entry.totalTime;
        if (entryDate >= thirtyDaysAgo) last30DaysHours += entry.totalTime;
      }
    }
  }

  pilot.experience = {
    totalHours: Math.round(totalHours * 10) / 10,
    picHours: Math.round(picHours * 10) / 10,
    nightHours: Math.round(nightHours * 10) / 10,
    ifrHours: Math.round(ifrHours * 10) / 10,
    crossCountryHours: Math.round(crossCountryHours * 10) / 10,
    last90DaysHours: Math.round(last90DaysHours * 10) / 10,
    last30DaysHours: Math.round(last30DaysHours * 10) / 10,
  };

  await pilot.save();
}
