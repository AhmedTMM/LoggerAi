// Reducto Document Intelligence Service
// For parsing handwritten pilot logbooks and maintenance PDFs
// Optimized for large, cluttered documents with OCR support

interface ReductoResponse {
  success: boolean;
  data?: ParsedDocument;
  error?: string;
}

interface ParsedDocument {
  documentType: 'logbook' | 'maintenance' | 'unknown';
  extractedData: Record<string, any>;
  confidence: number;
  rawText: string;
}

interface LogbookEntry {
  date: string;
  aircraft: string;
  route: string;
  duration: number;
  remarks?: string;
}

interface MaintenanceEntry {
  date: string;
  description: string;
  hobbsTime?: number;
  tachTime?: number;
  mechanic?: string;
  signOff?: boolean;
}

// Document analysis result for classification
export interface DocumentAnalysis {
  detectedType: 'logbook' | 'maintenance' | 'poh' | 'unknown';
  confidence: number;
  suggestedName: string;
  pilotName?: string;
  aircraftTailNumbers?: string[];
  dateRange?: { from: string; to: string };
  estimatedEntryCount: number;
  documentQuality: 'excellent' | 'good' | 'fair' | 'poor';
  qualityNotes: string[];
  isHandwritten: boolean;
  pageCount?: number;
  summary: string;
}

import { Reducto, toFile } from 'reductoai';
import { ExtractRunResponse } from 'reductoai/resources/extract';


export async function parseDocument(
  fileBase64: string,
  fileType: 'pdf' | 'image',
  documentType: 'logbook' | 'maintenance'
): Promise<ReductoResponse> {
  const apiKey = process.env.REDUCTO_API_KEY;

  if (!apiKey) {
    console.warn('Reducto API key not configured');
    return {
      success: false,
      error: 'Reducto API key not configured',
    };
  }

  try {
    const client = new Reducto({ apiKey });

    // 1. Upload File using helper
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const upload = await client.upload({
      file: await toFile(fileBuffer, fileType === 'image' ? 'document.png' : 'document.pdf'),
      extension: fileType === 'image' ? 'png' : 'pdf',
    });

    // 2. Prepare Prompt
    const prompt = documentType === 'logbook'
      ? LOGBOOK_EXTRACTION_PROMPT
      : MAINTENANCE_EXTRACTION_PROMPT;

    // 3. Extract Structured Data
    const extraction = await client.extract.run({
      input: upload,
      instructions: {
        system_prompt: prompt,
      },
      settings: {
        optimize_for_latency: true
      }
    });

    // 4. Adapt to internal format
    if ('job_id' in extraction && !('result' in extraction)) {
      // Handle async response if it happens (though we didn't request async)
      return { success: false, error: 'Received async job id but expected sync result' };
    }

    const items = (extraction as any).result || [];
    let extractedData: Record<string, any> = {};

    if (documentType === 'logbook') {
      extractedData = { entries: items };
    } else {
      extractedData = { entries: items };
    }

    return {
      success: true,
      data: {
        documentType: documentType,
        extractedData,
        confidence: 1.0,
        rawText: '',
      },
    };
  } catch (error) {
    console.error('Reducto service error:', error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

// Process raw Reducto output into structured data
function processExtractedData(rawResult: any, documentType: string): ParsedDocument {
  const extractedText = rawResult.text || rawResult.extracted_text || '';
  const tables = rawResult.tables || [];
  const structuredData = rawResult.structured_data || {};

  let extractedData: Record<string, any> = {};

  if (documentType === 'logbook') {
    extractedData = parseLogbookData(structuredData, tables, extractedText);
  } else if (documentType === 'maintenance') {
    extractedData = parseMaintenanceData(structuredData, tables, extractedText);
  }

  return {
    documentType: documentType as 'logbook' | 'maintenance',
    extractedData,
    confidence: rawResult.confidence || 0.8,
    rawText: extractedText,
  };
}

// Parse pilot logbook entries
function parseLogbookData(
  structured: any,
  tables: any[],
  rawText: string
): { entries: LogbookEntry[] } {
  const entries: LogbookEntry[] = [];

  // If structured data contains entries
  if (structured.entries) {
    for (const entry of structured.entries) {
      entries.push({
        date: entry.date || '',
        aircraft: entry.aircraft || entry.tail_number || '',
        route: entry.route || entry.from_to || '',
        duration: parseFloat(entry.duration || entry.total_time || '0'),
        remarks: entry.remarks || entry.notes || '',
      });
    }
  }

  // Parse from tables if available
  if (tables.length > 0) {
    for (const table of tables) {
      const headers = table.headers || [];
      const rows = table.rows || [];

      for (const row of rows) {
        const entry: LogbookEntry = {
          date: '',
          aircraft: '',
          route: '',
          duration: 0,
        };

        headers.forEach((header: string, idx: number) => {
          const value = row[idx];
          const headerLower = header.toLowerCase();

          if (headerLower.includes('date')) entry.date = value;
          if (headerLower.includes('aircraft') || headerLower.includes('tail'))
            entry.aircraft = value;
          if (headerLower.includes('route') || headerLower.includes('from'))
            entry.route = value;
          if (headerLower.includes('time') || headerLower.includes('duration'))
            entry.duration = parseFloat(value) || 0;
          if (headerLower.includes('remark')) entry.remarks = value;
        });

        if (entry.date || entry.aircraft) {
          entries.push(entry);
        }
      }
    }
  }

  return { entries };
}

// Parse maintenance log entries
function parseMaintenanceData(
  structured: any,
  tables: any[],
  rawText: string
): { entries: MaintenanceEntry[] } {
  const entries: MaintenanceEntry[] = [];

  // If structured data contains entries
  if (structured.entries || structured.maintenance_items) {
    const items = structured.entries || structured.maintenance_items;
    for (const entry of items) {
      entries.push({
        date: entry.date || '',
        description: entry.description || entry.work_performed || '',
        hobbsTime: parseFloat(entry.hobbs || entry.hobbs_time || '0') || undefined,
        tachTime: parseFloat(entry.tach || entry.tach_time || '0') || undefined,
        mechanic: entry.mechanic || entry.technician || '',
        signOff: entry.sign_off || entry.signed || false,
      });
    }
  }

  // Parse annual/inspection data
  if (structured.annual_date || structured.last_annual) {
    entries.push({
      date: structured.annual_date || structured.last_annual,
      description: 'Annual Inspection',
      signOff: true,
    });
  }

  return { entries };
}

// Extraction prompts for different document types
// OPTIMIZED FOR LARGE, CLUTTERED LOGBOOKS WITH OCR/HANDWRITTEN TEXT

const LOGBOOK_EXTRACTION_PROMPT = `
You are an expert aviation logbook parser specializing in difficult OCR and handwritten documents.

CRITICAL INSTRUCTIONS FOR CLUTTERED/HANDWRITTEN LOGBOOKS:
1. This document may be SCANNED, PHOTOCOPIED, or HANDWRITTEN - expect OCR artifacts
2. Pages may have MULTIPLE LAYOUTS - look for column headers to understand structure
3. CONTINUE READING every row even if data quality degrades - make best effort guesses
4. Some pages may be SIDEWAYS or have mixed orientations - adapt accordingly
5. Look for RUNNING TOTALS at page bottoms - these confirm extracted data
6. If a number is ambiguous (1/7, 0/O, 5/S), use context from other entries to decide

IDENTIFYING LOGBOOK STRUCTURE:
- Look for header row containing: DATE, AIRCRAFT, FROM/TO, ROUTE, and various HOUR columns
- Standard Jeppesen/ASA logbooks have specific column layouts
- Electronic logbooks (ForeFlight, LogTen) have different formats
- Military logbooks use different terminology (sorties, etc.)

REQUIRED FIELDS (extract if visible):
- date: Flight date (YYYY-MM-DD format). Parse various formats: MM/DD/YY, DD-MMM-YYYY, etc.
- aircraftIdent: Tail number (N-numbers start with N, international varies)
- aircraftType: Make/model abbreviations (C172=Cessna 172, PA28=Piper Cherokee, etc.)
- from: Departure airport (3-4 letter code, may be handwritten)
- to: Destination airport
- route: Multi-leg route or round-robin flights

HOUR COLUMNS (extract ALL visible, use decimal hours):
- totalTime: Total duration (this is the PRIMARY time field)
- sel: Single Engine Land
- mel: Multi Engine Land
- ses: Single Engine Sea
- mes: Multi Engine Sea
- pic: Pilot In Command
- sic: Second In Command
- cfi: CFI/Instruction Given
- solo: Solo flight time
- dualReceived: Dual/Instruction received
- dualGiven: Instruction given (CFI time)
- crossCountry: XC time (flights > 50nm)
- night: Night flying
- actualInstrument: Actual IMC/IFR
- simulatedInstrument: Hood/foggles time
- flightSim: Simulator (AATD/BATD/FTD)
- turbine: Turbine/Jet time
- complex: Complex aircraft time
- highPerformance: High performance aircraft time
- tailwheel: Tailwheel/conventional gear

LANDINGS (integers only):
- landingsDay: Day landings
- landingsNight: Night landings
- landingsFullStop: Full stop landings
- landingsTouch: Touch and goes

APPROACHES AND HOLDS:
- approaches: Array of approach types flown, e.g. ["ILS 4R", "VOR 27"]
- holds: Number of holding patterns

REMARKS (VERY IMPORTANT - capture ALL text):
- remarks: Everything in remarks/comments column including:
  - Instructor names and signatures
  - Endorsements (solo, XC, checkride)
  - Approach details
  - Weather conditions mentioned
  - Passengers names
  - Checkride results
  - Any other notes

DEALING WITH POOR QUALITY:
- If a tail number is partially visible, include what you can read with a ? (e.g., "N539?R")
- If dates are unclear, use surrounding entries to infer correct year
- For smudged times, round to nearest 0.1
- Include a "dataQuality" field: "clear", "readable", "degraded", or "guessed"

OUTPUT FORMAT:
Return a JSON array. Include ONLY fields that have actual values.
Parse EVERY visible row - do not skip entries even if quality is poor.

[
  {
    "date": "2024-01-15",
    "aircraftIdent": "N5392R",
    "aircraftType": "C172",
    "from": "KJFK",
    "to": "KBOS",
    "totalTime": 2.5,
    "sel": 2.5,
    "pic": 2.5,
    "crossCountry": 2.5,
    "landingsDay": 1,
    "approaches": ["ILS 4R"],
    "remarks": "XC to Boston. J. Smith - CFI",
    "dataQuality": "clear"
  }
]
`;

const MAINTENANCE_EXTRACTION_PROMPT = `
You are an expert aircraft maintenance log parser specializing in FAA Part 91/135 documentation.

CRITICAL: This may be SCANNED, HANDWRITTEN, or PHOTOCOPIED - expect OCR artifacts.

MAINTENANCE LOG STRUCTURE:
- Aircraft maintenance logs are chronological records of all maintenance performed
- Each entry must have a date, description, and mechanic signature/approval
- Entries may span multiple lines for complex work

FOR EACH MAINTENANCE ENTRY, EXTRACT:
- date: Date work was performed (YYYY-MM-DD format)
- description: Full description of work performed
- hobbsTime: Aircraft hobbs time at maintenance (if recorded)
- tachTime: Tachometer time at maintenance
- ttaf: Total Time Airframe (if recorded)
- ttsn: Time Since New
- tso: Time Since Overhaul
- mechanic: Mechanic name or A&P certificate number
- ia: IA name if inspection approval
- certificateNumber: A&P/IA certificate number
- signedOff: true if properly signed off
- workOrderNumber: Work order/invoice number
- partNumbers: Array of part numbers replaced
- isInspection: true if this is an inspection entry
- inspectionType: "annual" | "100hour" | "progressive" | "condition" | "transponder" | "static" | "elt"

INSPECTION DATES TO SPECIFICALLY EXTRACT:
- Annual inspection (14 CFR 91.409)
- 100-hour inspection (14 CFR 91.409)
- Transponder check (14 CFR 91.413) - every 24 months
- Static system/altimeter check (14 CFR 91.411) - every 24 months
- ELT inspection (14 CFR 91.207) - every 12 months
- ADs (Airworthiness Directives) compliance

DEALING WITH POOR QUALITY:
- If a date is unclear, note uncertainty in description
- Capture partial certificate numbers
- Include "unclear:" prefix for illegible portions

OUTPUT FORMAT:
Return JSON object with:
{
  "entries": [...],
  "annualDate": "YYYY-MM-DD",
  "hundredHourDate": "YYYY-MM-DD",
  "transponderDate": "YYYY-MM-DD",
  "staticDate": "YYYY-MM-DD",
  "eltDate": "YYYY-MM-DD",
  "currentHobbs": 1234.5,
  "currentTach": 1234.5,
  "aircraftIdent": "N12345",
  "aircraftMakeModel": "Cessna 172S"
}
`;

const POH_EXTRACTION_PROMPT = `
Extract operating limits and specifications from this Pilot Operating Handbook (POH).
Specifically extract:
1. V-Speeds (in Knots):
   - Vso (Stall speed in landing configuration)
   - Vs1 (Stall speed in clean configuration)
   - Vr (Rotation speed)
   - Vx (Best angle of climb)
   - Vy (Best rate of climb)
   - Vfe (Maximum flap extended speed)
   - Va (Maneuvering speed)
   - Vno (Max structural cruising speed)
   - Vne (Never exceed speed)

2. Weights (in lbs):
   - Max Gross Weight
   - Standard Empty Weight
   - Useful Load
   - Fuel Capacity (Total and Usable in gallons)

Return as a JSON object with keys: vSpeeds (object with keys above camelCase), weights (object with keys above camelCase).
`;

// Parse POH from URL
export async function parsePOHFromUrl(pohUrl: string): Promise<ReductoResponse> {
  try {
    const apiKey = process.env.REDUCTO_API_KEY;

    if (!apiKey) {
      return { success: false, error: 'Reducto API key not configured' };
    }

    // 1. Fetch PDF manually to avoid Reducto download issues
    const response = await fetch(pohUrl);
    if (!response.ok) throw new Error(`Failed to fetch POH PDF: ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const client = new Reducto({ apiKey });

    // 2. Upload
    const upload = await client.upload({
      file: await toFile(buffer, 'poh.pdf'),
      extension: 'pdf'
    });

    // 3. Extract
    const extraction = await client.extract.run({
      input: upload,
      instructions: {
        system_prompt: POH_EXTRACTION_PROMPT
      }
    });

    if ('job_id' in extraction && !('result' in extraction)) {
      return { success: false, error: 'Async job ID returned' };
    }

    const res = (extraction as any).result;
    const data = res && res.length > 0 ? res[0] : {};

    return {
      success: true,
      data: {
        documentType: 'unknown',
        extractedData: data as Record<string, any>,
        confidence: 1.0,
        rawText: '',
      }
    };

  } catch (error) {
    console.error('POH parsing error:', error);
    return { success: false, error: (error as Error).message };
  }
}

export type { ReductoResponse, ParsedDocument };

export function aggregateLogbookHours(entries: LogbookEntry[]): {
  totalHours: number;
  picHours: number;
  nightHours: number;
  ifrHours: number;
  last90DaysHours: number;
  last30DaysHours: number;
} {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let totalHours = 0;
  let picHours = 0;
  let nightHours = 0;
  let ifrHours = 0;
  let last90DaysHours = 0;
  let last30DaysHours = 0;

  for (const entry of entries) {
    const duration = entry.duration || 0;
    totalHours += duration;

    // Simple heuristics since our basic prompt might not capture every column
    // Assume if it's in the logbook, it contributes to total.
    // We'll estimate PIC as 100% for now unless defined otherwise (often safe for private logbooks uploaded by owner)
    // Real parsing would look for specific columns.
    picHours += duration;

    // Check remarks for "Night" or "IFR" keywords if explicit columns missing
    const remarks = (entry.remarks || '').toLowerCase();

    if (remarks.includes('night')) {
      nightHours += duration;
    }

    if (remarks.includes('ifr') || remarks.includes('imc') || remarks.includes('approach')) {
      ifrHours += duration;
    }

    // Date based calc
    if (entry.date) {
      const entryDate = new Date(entry.date);
      if (!isNaN(entryDate.getTime())) {
        if (entryDate >= ninetyDaysAgo) last90DaysHours += duration;
        if (entryDate >= thirtyDaysAgo) last30DaysHours += duration;
      }
    }
  }

  return {
    totalHours,
    picHours,
    nightHours,
    ifrHours,
    last90DaysHours,
    last30DaysHours
  };
}

// Document Analysis Prompt - for quick classification before full parsing
const DOCUMENT_ANALYSIS_PROMPT = `
You are an expert aviation document classifier. Analyze this document and provide a quick assessment.

DOCUMENT TYPES TO IDENTIFY:
1. PILOT LOGBOOK - Contains flight entries with dates, aircraft, times, landings
   - Look for: DATE columns, AIRCRAFT/TAIL columns, TIME columns (SEL, MEL, PIC, etc.)
   - Page layout is typically tabular with many columns
   - May have "PILOT LOGBOOK" header or standard Jeppesen/ASA format

2. MAINTENANCE LOG - Aircraft maintenance records
   - Look for: Date, Description of work, Hobbs/Tach times, Mechanic signatures
   - References to inspections, parts, ADs (Airworthiness Directives)
   - May have "AIRCRAFT MAINTENANCE LOG" or "ENGINE LOG" headers

3. POH (Pilot Operating Handbook) - Aircraft operating manual
   - Sections for performance, limitations, emergency procedures
   - V-speeds, weight & balance, checklists
   - Usually has manufacturer branding and model designation

4. UNKNOWN - Cannot determine document type

QUALITY ASSESSMENT:
- EXCELLENT: Clear print/type, easy to read
- GOOD: Minor quality issues, still clearly readable
- FAIR: Some OCR/handwriting challenges, partially degraded
- POOR: Significant quality issues, many unclear portions

OUTPUT JSON:
{
  "detectedType": "logbook" | "maintenance" | "poh" | "unknown",
  "confidence": 0.0-1.0,
  "suggestedName": "Descriptive name for this document",
  "pilotName": "Name if found on logbook cover/pages",
  "aircraftTailNumbers": ["N12345", "N67890"],
  "dateRange": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"},
  "estimatedEntryCount": 50,
  "documentQuality": "excellent" | "good" | "fair" | "poor",
  "qualityNotes": ["Handwritten entries", "Some faded text"],
  "isHandwritten": true/false,
  "pageCount": 10,
  "summary": "Brief 1-2 sentence description of what this document contains"
}
`;

// Analyze a document to determine type and quality before full parsing
export async function analyzeDocument(
  fileBase64: string,
  fileType: 'pdf' | 'image'
): Promise<{ success: boolean; analysis?: DocumentAnalysis; error?: string }> {
  const apiKey = process.env.REDUCTO_API_KEY;

  if (!apiKey) {
    console.warn('Reducto API key not configured');
    return {
      success: false,
      error: 'Reducto API key not configured',
    };
  }

  try {
    const client = new Reducto({ apiKey });

    // Upload file
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const upload = await client.upload({
      file: await toFile(fileBuffer, fileType === 'image' ? 'document.png' : 'document.pdf'),
      extension: fileType === 'image' ? 'png' : 'pdf',
    });

    // Run analysis extraction
    const extraction = await client.extract.run({
      input: upload,
      instructions: {
        system_prompt: DOCUMENT_ANALYSIS_PROMPT,
      },
      settings: {
        optimize_for_latency: true
      }
    });

    if ('job_id' in extraction && !('result' in extraction)) {
      return { success: false, error: 'Received async job id but expected sync result' };
    }

    const items = (extraction as any).result || [];
    const analysisResult = items.length > 0 ? items[0] : null;

    if (!analysisResult) {
      // Fallback analysis if extraction returns empty
      return {
        success: true,
        analysis: {
          detectedType: 'unknown',
          confidence: 0.3,
          suggestedName: `Document_${Date.now()}`,
          estimatedEntryCount: 0,
          documentQuality: 'fair',
          qualityNotes: ['Unable to fully analyze document'],
          isHandwritten: false,
          summary: 'Document could not be fully analyzed'
        }
      };
    }

    // Build the analysis object from the extraction result
    const analysis: DocumentAnalysis = {
      detectedType: analysisResult.detectedType || 'unknown',
      confidence: analysisResult.confidence || 0.5,
      suggestedName: analysisResult.suggestedName || generateSuggestedName(analysisResult),
      pilotName: analysisResult.pilotName,
      aircraftTailNumbers: analysisResult.aircraftTailNumbers,
      dateRange: analysisResult.dateRange,
      estimatedEntryCount: analysisResult.estimatedEntryCount || 0,
      documentQuality: analysisResult.documentQuality || 'fair',
      qualityNotes: analysisResult.qualityNotes || [],
      isHandwritten: analysisResult.isHandwritten || false,
      pageCount: analysisResult.pageCount,
      summary: analysisResult.summary || 'Aviation document'
    };

    return {
      success: true,
      analysis
    };

  } catch (error) {
    console.error('Document analysis error:', error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

// Generate a suggested name based on analysis results
function generateSuggestedName(analysis: any): string {
  const type = analysis.detectedType || 'document';
  const typeLabel = type === 'logbook' ? 'Pilot Logbook'
    : type === 'maintenance' ? 'Maintenance Log'
    : type === 'poh' ? 'POH'
    : 'Aviation Document';

  const parts: string[] = [typeLabel];

  if (analysis.pilotName) {
    parts.push(`- ${analysis.pilotName}`);
  }

  if (analysis.aircraftTailNumbers?.length > 0) {
    parts.push(`(${analysis.aircraftTailNumbers.slice(0, 2).join(', ')})`);
  }

  if (analysis.dateRange?.from) {
    const fromYear = analysis.dateRange.from.split('-')[0];
    const toYear = analysis.dateRange.to?.split('-')[0] || fromYear;
    if (fromYear === toYear) {
      parts.push(fromYear);
    } else {
      parts.push(`${fromYear}-${toYear}`);
    }
  }

  return parts.join(' ');
}
