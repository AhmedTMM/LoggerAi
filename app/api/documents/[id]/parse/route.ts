import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import mongoose from 'mongoose';
import { parseDocumentUltraFast } from '@/lib/services/reductoService';
import dbConnect from '@/lib/db';
import Aircraft from '@/lib/models/Aircraft';
import Pilot from '@/lib/models/Pilot';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { readFileAsBase64, fileExists } from '@/lib/services/fileStorage';
import { calculateSummary } from '@/lib/services/documentProcessingUtils';

// Increase timeout to 5 minutes for large document processing
export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Helper to update document progress
async function updateProgress(docId: string, userId: string, progress: number, progressStep: string, status?: string) {
  const update: Record<string, any> = { progress, progressStep };
  if (status) update.status = status;
  await ParsedDocument.findOneAndUpdate({ _id: docId, userId }, update);
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
      await updateProgress(docId, userId, 30, 'uploading', 'parsing');

      // Progress: 50% - Processing document
      await updateProgress(docId, userId, 50, 'processing');

      // Use ultra-fast direct Gemini vision extraction
      // POH documents are treated as logbooks for extraction purposes
      const parseType = doc.documentType === 'poh' ? 'logbook' : doc.documentType;
      const result = await parseDocumentUltraFast(fileBase64, doc.fileType, parseType);

      // Progress: 80% - Extracting entries
      await updateProgress(docId, userId, 80, 'extracting');

      if (!result.success) {
        await ParsedDocument.findOneAndUpdate({ _id: docId, userId }, {
          status: 'failed',
          progress: 0,
          progressStep: 'failed',
          error: result.error,
        });
        return NextResponse.json(
          { success: false, error: 'Failed to parse document', documentId: docId },
          { status: 500 }
        );
      }

      // Extract entries from result
      const entries = result.data?.extractedData?.entries ||
        (Array.isArray(result.data?.extractedData) ? result.data?.extractedData : []);

      // Calculate summary
      const summary = calculateSummary(entries);

      // Update document with parsed data
      await ParsedDocument.findOneAndUpdate({ _id: docId, userId }, {
        status: 'completed',
        progress: 100,
        progressStep: 'complete',
        parsedAt: new Date(),
        rawOutput: result.data?.extractedData,
        entries,
        summary,
        fileBase64: undefined, // Clear stored file to save space
      });

      // Update linked aircraft if maintenance type
      if (doc.aircraft && doc.documentType === 'maintenance' && entries.length > 0) {
        await updateAircraftFromParsedData(doc.aircraft.toString(), entries, result.data?.extractedData);
      }

      // Update linked pilot if logbook type
      if (doc.pilot && doc.documentType === 'logbook') {
        await updatePilotFromParsedData(doc.pilot.toString(), entries);
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
      await ParsedDocument.findOneAndUpdate({ _id: docId, userId }, {
        status: 'failed',
        progress: 0,
        progressStep: 'failed',
        error: (parseError as Error).message,
      });
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

async function updateAircraftFromParsedData(
  aircraftId: string,
  entries: any[],
  extractedData: any
) {
  const aircraft = await Aircraft.findById(aircraftId);
  if (!aircraft) return;

  // Add maintenance entries to logs (hobbsTime and tachTime are now optional)
  const newLogs = entries.map((entry: any) => {
    const log: any = {
      date: entry.date ? new Date(entry.date) : new Date(),
      description: entry.description || entry.workPerformed || 'Maintenance entry',
      mechanic: entry.mechanic || entry.signedBy,
    };

    // Only add hobbsTime/tachTime if they have valid values
    if (entry.hobbsTime != null && !isNaN(entry.hobbsTime)) {
      log.hobbsTime = entry.hobbsTime;
    }
    if (entry.tachTime != null && !isNaN(entry.tachTime)) {
      log.tachTime = entry.tachTime;
    }
    // Add certificate number if available
    if (entry.certificateNumber) {
      log.certificateNumber = entry.certificateNumber;
    }

    return log;
  }).filter(log => log.description && log.description !== 'Maintenance entry');

  if (newLogs.length > 0) {
    aircraft.logs.push(...newLogs);
  }

  // Extract maintenance dates from entries that are inspections
  let latestAnnual: Date | null = null;
  let latestTransponder: Date | null = null;
  let latestStatic: Date | null = null;
  let latestHundredHour: Date | null = null;
  let maxHobbs = aircraft.currentHours.hobbs;
  let maxTach = aircraft.currentHours.tach;

  for (const entry of entries) {
    const entryDate = entry.date ? new Date(entry.date) : null;

    // Check for inspection types
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

    // Also check description for keywords if inspectionType not set
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

    // Track max hobbs/tach
    if (entry.hobbsTime && entry.hobbsTime > maxHobbs) maxHobbs = entry.hobbsTime;
    if (entry.tachTime && entry.tachTime > maxTach) maxTach = entry.tachTime;
  }

  // Update maintenance dates from extracted entries
  if (latestAnnual) aircraft.maintenanceDates.annual = latestAnnual;
  if (latestTransponder) aircraft.maintenanceDates.transponder = latestTransponder;
  if (latestStatic) aircraft.maintenanceDates.staticSystem = latestStatic;
  if (latestHundredHour) aircraft.maintenanceDates.hundredHour = latestHundredHour;

  // Also check extractedData for dates (legacy support)
  if (extractedData?.annualDate) {
    aircraft.maintenanceDates.annual = new Date(extractedData.annualDate);
  }
  if (extractedData?.transponderDate) {
    aircraft.maintenanceDates.transponder = new Date(extractedData.transponderDate);
  }
  if (extractedData?.staticSystemDate) {
    aircraft.maintenanceDates.staticSystem = new Date(extractedData.staticSystemDate);
  }

  // Update current hours to max found
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

  // Handle nested flights structure from Reducto
  let flatEntries = entries;
  if (entries.length === 1 && entries[0].flights) {
    flatEntries = entries[0].flights;
  }

  // Convert parsed entries to flight format
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

  // Replace all entries (full logbook upload replaces existing)
  pilot.flightEntries = flightEntries;

  // Calculate experience totals from all entries
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
