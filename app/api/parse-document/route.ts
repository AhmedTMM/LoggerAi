import { NextRequest, NextResponse } from 'next/server';
import { parseDocumentUltraFast } from '@/lib/services/reductoService';
import { generateSafetyAnalysis } from '@/lib/services/safetyAnalysisService';
import dbConnect from '@/lib/db';
import Aircraft from '@/lib/models/Aircraft';
import Pilot from '@/lib/models/Pilot';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { requireAuth } from '@/lib/auth-helpers';

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

    // If aircraft linked and maintenance type, update aircraft
    if (aircraftId && documentType === 'maintenance' && entries.length > 0) {
      await updateAircraftFromParsedData(aircraftId, entries, result.data?.extractedData);
    }

    // If pilot linked and logbook type, update pilot
    if (pilotId && documentType === 'logbook') {
      await updatePilotFromParsedData(pilotId, entries);
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

    // Update aircraft if linked
    if (aircraftId && documentType === 'maintenance' && entries.length > 0) {
      await updateAircraftFromParsedData(aircraftId, entries, result.data?.extractedData);
    }

    // Update pilot if linked
    if (pilotId && documentType === 'logbook') {
      await updatePilotFromParsedData(pilotId, entries);
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
  const newLogs = entries.map((entry: any) => ({
    date: entry.date ? new Date(entry.date) : new Date(),
    description: entry.description || entry.workPerformed || 'Maintenance entry',
    hobbsTime: entry.hobbsTime || entry.hobbs,
    tachTime: entry.tachTime || entry.tach,
    mechanic: entry.mechanic || entry.signedBy,
  })).filter(log => log.description);

  if (newLogs.length > 0) {
    aircraft.logs.push(...newLogs);
  }

  // Update maintenance dates from extracted data
  if (extractedData?.annualDate) {
    aircraft.maintenanceDates.annual = new Date(extractedData.annualDate);
  }
  if (extractedData?.transponderDate) {
    aircraft.maintenanceDates.transponder = new Date(extractedData.transponderDate);
  }
  if (extractedData?.staticSystemDate) {
    aircraft.maintenanceDates.staticSystem = new Date(extractedData.staticSystemDate);
  }

  // Update hobbs/tach if found
  const latestEntry = entries[entries.length - 1];
  if (latestEntry?.hobbsTime && latestEntry.hobbsTime > aircraft.currentHours.hobbs) {
    aircraft.currentHours.hobbs = latestEntry.hobbsTime;
  }
  if (latestEntry?.tachTime && latestEntry.tachTime > aircraft.currentHours.tach) {
    aircraft.currentHours.tach = latestEntry.tachTime;
  }

  // Regenerate safety analysis with new logs
  const allLogs = aircraft.logs || [];
  if (allLogs.length > 0) {
    aircraft.safetyAnalysis = generateSafetyAnalysis(allLogs, aircraft);
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
