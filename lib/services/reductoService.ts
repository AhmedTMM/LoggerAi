// Reducto Document Intelligence Service
// For parsing handwritten pilot logbooks and maintenance PDFs
// Optimized for large, cluttered documents with OCR support
// Enhanced with step-by-step logging for real-time progress tracking

interface ReductoResponse {
  success: boolean;
  data?: ParsedDocument;
  error?: string;
}

interface ParsedDocument {
  documentType: string;  // Can be any document type (pilot_logbook, aircraft_logbook, maintenance, etc.)
  extractedData: Record<string, any>;
  confidence: number;
  rawText: string;
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

// Step logging types for real-time progress
export type ProcessingStep =
  | 'initializing'
  | 'validating'
  | 'preparing'
  | 'uploading'
  | 'analyzing'
  | 'classifying'
  | 'extracting'
  | 'parsing'
  | 'structuring'
  | 'validating_output'
  | 'complete'
  | 'error';

export interface StepLog {
  step: ProcessingStep;
  message: string;
  timestamp: Date;
  progress: number;
  details?: Record<string, any>;
  duration?: number;
}

export type StepCallback = (log: StepLog) => void | Promise<void>;

import { Reducto, toFile } from 'reductoai';
import {
  isOpenRouterConfigured,
  generateCompletion,
  generateVisionCompletion,
  OPENROUTER_MODELS,
} from './openRouterClient';
import { repairAndParseJSON } from '@/lib/utils/jsonRepair';

// Base timeout constants for API calls (scaled up for large files)
const REDUCTO_UPLOAD_TIMEOUT_BASE = 60000;   // 60 seconds base for upload
const REDUCTO_PARSE_TIMEOUT_BASE = 180000;   // 3 minutes base for parse (OCR) - large PDFs need this
const REDUCTO_EXTRACT_TIMEOUT_BASE = 300000; // 5 minutes base for extract (LLM)

/**
 * Calculate dynamic timeout based on file size
 * Larger files need proportionally more time
 */
function getScaledTimeout(baseTimeout: number, fileSizeBytes: number): number {
  const MB = 1024 * 1024;
  const fileSizeMB = fileSizeBytes / MB;

  // Scale factor: 1x for files under 5MB, then add 30s per additional 5MB
  if (fileSizeMB <= 5) {
    return baseTimeout;
  }

  const additionalMB = fileSizeMB - 5;
  const additionalTime = Math.ceil(additionalMB / 5) * 30000; // 30s per 5MB

  // Cap at 10 minutes max
  return Math.min(baseTimeout + additionalTime, 600000);
}

/**
 * Wraps a promise with a timeout. Rejects if the promise doesn't resolve within the specified time.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

// ============ SHARED HELPERS ============

type StepLogger = (step: ProcessingStep, message: string, progress: number, details?: Record<string, any>) => Promise<void>;

/**
 * Creates a step logging closure bound to a start time and callback.
 */
function createStepLogger(startTime: number, onStep?: StepCallback): StepLogger {
  return async (step: ProcessingStep, message: string, progress: number, details?: Record<string, any>) => {
    if (onStep) {
      await onStep({
        step,
        message,
        timestamp: new Date(),
        progress,
        details,
        duration: Date.now() - startTime
      });
    }
  };
}

/**
 * Checks if a document type is a logbook variant.
 */
function isLogbookDocumentType(documentType: string): boolean {
  return documentType === 'logbook' || documentType.includes('logbook');
}

/**
 * Parses AI text response using JSON repair, extracts entries and remaining data.
 * Returns null if parsing fails.
 */
function repairAndExtractEntries(
  aiText: string
): { items: any[]; rawData: any } | null {
  const repairResult = repairAndParseJSON(aiText);

  if (!repairResult.success) {
    return null;
  }

  const items = repairResult.data.entries || [];
  const { entries: _, ...rawData } = repairResult.data;

  return { items, rawData };
}

/**
 * Calculates total hours for logbook entries and logs completion,
 * then builds and returns the standard ReductoResponse.
 */
async function buildParseResult(
  items: any[],
  rawData: any,
  documentType: string,
  rawText: string,
  startTime: number,
  mode: string,
  log: StepLogger
): Promise<ReductoResponse> {
  const isLogbook = isLogbookDocumentType(documentType);

  let totalHours = 0;
  if (isLogbook) {
    totalHours = items.reduce((sum: number, entry: any) => {
      return sum + (parseFloat(entry.totalTime) || parseFloat(entry.duration) || 0);
    }, 0);
  }

  const totalDuration = Date.now() - startTime;
  await log('complete', 'Document processing complete!', 100, {
    entryCount: items.length,
    totalHours: isLogbook ? Math.round(totalHours * 10) / 10 : undefined,
    processingTimeMs: totalDuration,
    success: true,
    mode
  });

  return {
    success: true,
    data: {
      documentType,
      extractedData: { entries: items, ...rawData },
      confidence: 1.0,
      rawText,
    },
  };
}

/**
 * ULTRA-FAST: Direct Gemini Vision extraction (no OCR step)
 * Uses Gemini's native PDF/image understanding to extract data directly.
 *
 * Expected time: 5-15 seconds total (vs 60-180s with OCR pipeline)
 *
 * This bypasses Reducto entirely and sends the document directly to Gemini,
 * which has excellent vision capabilities for both PDFs and images.
 */
export async function parseDocumentUltraFast(
  fileBase64: string,
  fileType: 'pdf' | 'image',
  documentType: string,  // Accepts any document type - internally maps to logbook or maintenance prompts
  onStep?: StepCallback
): Promise<ReductoResponse> {
  const startTime = Date.now();
  const log = createStepLogger(startTime, onStep);

  if (!isOpenRouterConfigured()) {
    console.warn('[UltraFast] OpenRouter API key not configured, falling back to OCR pipeline');
    return parseDocumentFast(fileBase64, fileType, documentType, onStep);
  }

  try {
    await log('initializing', 'Starting ultra-fast AI extraction...', 5, {
      documentType,
      fileType,
      mode: 'direct-vision'
    });

    // Check file size - Vision models can handle larger files inline
    const fileSizeBytes = Math.ceil((fileBase64.length * 3) / 4);
    const MAX_VISION_SIZE = 20 * 1024 * 1024; // 20MB

    if (fileSizeBytes > MAX_VISION_SIZE) {
      await log('initializing', 'File too large for direct extraction, using OCR pipeline...', 10);
      return parseDocumentFast(fileBase64, fileType, documentType, onStep);
    }

    await log('preparing', 'Preparing document for AI analysis...', 10, {
      sizeKB: Math.round(fileSizeBytes / 1024),
      format: fileType
    });

    const prompt = isLogbookDocumentType(documentType)
      ? ULTRA_FAST_LOGBOOK_PROMPT
      : ULTRA_FAST_MAINTENANCE_PROMPT;

    const mimeType = fileType === 'pdf' ? 'application/pdf' : 'image/png';

    await log('extracting', 'Sending to AI Vision for direct extraction...', 20, {
      model: OPENROUTER_MODELS.FAST,
      mode: 'vision-direct'
    });

    const extractionStart = Date.now();
    const aiText = await generateVisionCompletion({
      model: OPENROUTER_MODELS.FAST,
      userPrompt: prompt,
      imageBase64: fileBase64,
      mimeType,
      maxTokens: 65536,
      temperature: 0.1,
    });

    const extractionTime = Date.now() - extractionStart;
    await log('parsing', `AI extraction complete in ${(extractionTime / 1000).toFixed(1)}s`, 70, {
      extractionTimeMs: extractionTime
    });

    await log('structuring', 'Parsing extracted data...', 80);

    const extracted = repairAndExtractEntries(aiText);
    if (!extracted) {
      await log('error', 'Could not parse AI response, falling back to OCR pipeline', 80);
      return parseDocumentFast(fileBase64, fileType, documentType, onStep);
    }

    await log('validating_output', 'Validating extracted entries...', 90, {
      entryCount: extracted.items.length
    });

    return buildParseResult(extracted.items, extracted.rawData, documentType, '', startTime, 'ultra-fast-vision', log);

  } catch (error) {
    const errorMessage = (error as Error).message;

    // Check if it's a quota/rate limit error
    if (errorMessage.includes('quota') || errorMessage.includes('429') || errorMessage.includes('rate')) {
      await log('error', 'AI quota exceeded, using OCR-only mode', 0);
      return parseDocument(fileBase64, fileType, documentType, onStep);
    }

    await log('error', `Direct extraction failed: ${errorMessage}`, 0);
    return parseDocumentFast(fileBase64, fileType, documentType, onStep);
  }
}

// Ultra-fast prompts optimized for direct vision extraction
const ULTRA_FAST_LOGBOOK_PROMPT = `You are an expert at extracting flight entries from pilot logbooks, including handwritten and scanned documents.

CRITICAL: You MUST extract ALL visible flight entries with their HOURS. This is a pilot logbook - it WILL have time/hours data.

UNDERSTANDING LOGBOOK STRUCTURE:
- Pilot logbooks have ROWS (one per flight) and COLUMNS (different data fields)
- Look for column headers at the top: DATE, AIRCRAFT, FROM, TO, and multiple TIME columns
- TIME columns typically include: TOTAL TIME, PIC, SEL, XC, NIGHT, INSTRUMENT, DUAL, etc.
- Numbers in time columns are flight hours in DECIMAL format (1.5 = 1 hour 30 min) or sometimes as X:XX
- The TOTAL TIME column is the most important - it shows total flight duration

For EACH flight entry row, extract:
- date: YYYY-MM-DD format (convert from MM/DD/YY, MM-DD-YYYY, etc.)
- aircraftIdent: Tail number (N-numbers like N12345, N5392R)
- aircraftType: Make/model (C172, PA28, C152, etc.)
- from: Departure airport (3-4 letter code like KRHV, KSJC, LAX)
- to: Arrival airport code
- totalTime: REQUIRED - Total flight time in decimal hours. Look for the main TIME or TOTAL column. This is usually the first or most prominent time column.
- pic: PIC (Pilot in Command) hours - often equals totalTime for private pilots
- sic: SIC hours
- sel: Single Engine Land hours - often equals totalTime for single-engine aircraft
- mel: Multi Engine Land hours
- crossCountry: Cross-country/XC hours
- night: Night flying hours
- actualInstrument: Actual IMC/instrument hours
- simulatedInstrument: Hood/simulated instrument hours
- dualReceived: Instruction received hours (student/training flights)
- dualGiven: Instruction given hours (CFI flights)
- landingsDay: Day landings (integer)
- landingsNight: Night landings (integer)
- remarks: Notes, instructor names, endorsements

IMPORTANT EXTRACTION RULES:
1. EVERY flight entry MUST have totalTime - this is the primary flight duration. If you see a time value in ANY column for a row, extract it as totalTime at minimum.
2. For handwritten entries: look carefully at each cell. Numbers like 1.5, 2.0, 1.3 are common flight times.
3. If you can't determine which column is totalTime, use the FIRST numeric time column or the largest time value in the row.
4. For single-engine aircraft (C172, PA28, C152, etc.), sel usually equals totalTime.
5. Extract EVERY row with a date, even if some fields are unclear.
6. If a time looks like "1.5" or "1:30", convert to decimal (1.5).
7. Do NOT skip rows - extract all visible entries.

Output ONLY a valid JSON array with NO markdown formatting:
[{"date":"2024-01-15","aircraftIdent":"N12345","totalTime":1.5,"sel":1.5,"pic":1.5,"from":"KRHV","to":"KSJC"},...]`;

const ULTRA_FAST_MAINTENANCE_PROMPT = `Extract ALL maintenance entries from this aircraft maintenance log.

CRITICAL FOR LARGE DOCUMENTS:
- Extract EVERY entry, even if there are hundreds
- Keep descriptions concise (max 200 chars each)
- Do NOT truncate - output ALL entries
- Use compact JSON format

For EACH entry, extract only:
- date: YYYY-MM-DD
- description: Brief work description (200 chars max)
- tachTime: Tach time if shown
- mechanic: Mechanic name/cert#
- isInspection: true if inspection
- inspectionType: "annual"/"100hour"/"transponder"/"static"/"elt" if applicable

At top level extract:
- annualDate, hundredHourDate, transponderDate, staticDate, eltDate: Most recent dates
- currentTach: Latest tach time
- aircraftIdent: Tail number

Output ONLY valid JSON, no markdown:
{"entries":[{"date":"2024-01-15","description":"Annual inspection","isInspection":true,"inspectionType":"annual"}],"annualDate":"2024-01-15","currentTach":1234.5}`;

/**
 * OPTIMIZED: Fast document parsing using Reducto Parse (OCR) + Gemini Flash (extraction)
 * This hybrid approach is significantly faster than using Reducto Extract alone.
 *
 * Pipeline:
 * 1. Reducto parse() - Fast OCR + layout detection (~5-15 seconds)
 * 2. Gemini Flash - Structured data extraction (~3-8 seconds)
 *
 * Total expected time: 10-25 seconds (vs 60-180 seconds with extract.run())
 */
export async function parseDocumentFast(
  fileBase64: string,
  fileType: 'pdf' | 'image',
  documentType: string,  // Accepts any document type - internally maps to logbook or maintenance prompts
  onStep?: StepCallback
): Promise<ReductoResponse> {
  const apiKey = process.env.REDUCTO_API_KEY;
  const startTime = Date.now();
  const log = createStepLogger(startTime, onStep);

  if (!apiKey) {
    console.warn('Reducto API key not configured');
    await log('error', 'Reducto API key not configured', 0);
    return { success: false, error: 'Reducto API key not configured' };
  }

  if (!isOpenRouterConfigured()) {
    console.warn('OpenRouter API key not configured, falling back to slow extraction');
    return parseDocument(fileBase64, fileType, documentType, onStep);
  }

  try {
    await log('initializing', 'Initializing fast OCR pipeline...', 5, { documentType, fileType, mode: 'hybrid' });

    const client = new Reducto({ apiKey });

    await log('preparing', 'Preparing document for OCR...', 10, {
      sizeKB: Math.round(fileBase64.length * 0.75 / 1024),
      format: fileType
    });

    // 1. Upload file to Reducto
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const filename = fileType === 'image' ? 'document.png' : 'document.pdf';

    await log('uploading', `Uploading ${filename} to Reducto...`, 15, {
      filename,
      sizeBytes: fileBuffer.length
    });

    const uploadTimeout = getScaledTimeout(REDUCTO_UPLOAD_TIMEOUT_BASE, fileBuffer.length);
    const parseTimeout = getScaledTimeout(REDUCTO_PARSE_TIMEOUT_BASE, fileBuffer.length);

    const uploadStart = Date.now();
    const upload = await withTimeout(
      client.upload({
        file: await toFile(fileBuffer, filename),
        extension: fileType === 'image' ? 'png' : 'pdf',
      }),
      uploadTimeout,
      'Reducto upload'
    );

    await log('uploading', `Document uploaded in ${((Date.now() - uploadStart) / 1000).toFixed(1)}s`, 25);

    // 2. Use parse endpoint (fast OCR) instead of extract (slow LLM)
    await log('extracting', 'Running fast OCR (Reducto Parse)...', 30, {
      model: 'reducto-parse',
      mode: 'ocr-only',
      timeout: `${parseTimeout / 1000}s`
    });

    const parseResult = await withTimeout(
      client.parse.run({
        input: upload,
        enhance: {
          summarize_figures: false,
        },
        retrieval: {
          chunking: {
            chunk_mode: 'disabled',
          }
        }
      }),
      parseTimeout,
      'Reducto OCR parse'
    );

    const ocrDuration = Date.now() - startTime;
    await log('parsing', `OCR complete in ${(ocrDuration / 1000).toFixed(1)}s`, 50, {
      ocrTimeMs: ocrDuration
    });

    // 3. Extract text content from parse result
    if ('job_id' in parseResult && !('result' in parseResult)) {
      await log('error', 'Received async job id but expected sync result', 50);
      return parseDocument(fileBase64, fileType, documentType, onStep);
    }

    let extractedText = '';
    const parseData = (parseResult as any).result;

    if (parseData?.type === 'full' && parseData?.chunks) {
      extractedText = parseData.chunks
        .map((chunk: any) => {
          if (chunk.blocks && chunk.blocks.length > 0) {
            return chunk.blocks
              .map((block: any) => {
                if (block.type === 'Table' && block.content) {
                  return `[TABLE]\n${block.content}\n[/TABLE]`;
                }
                return block.content || '';
              })
              .filter(Boolean)
              .join('\n\n');
          }
          return chunk.content || '';
        })
        .filter(Boolean)
        .join('\n\n');
    } else if (parseData?.type === 'url' && parseData?.url) {
      await log('extracting', 'Fetching OCR result from URL...', 45);
      try {
        const urlResponse = await fetch(parseData.url);
        const urlData = await urlResponse.json();
        if (urlData?.chunks) {
          extractedText = urlData.chunks
            .map((chunk: any) => chunk.content || '')
            .filter(Boolean)
            .join('\n\n');
        }
      } catch {
        // URL fetch failed, will fall back to extract method below
      }
    }

    if (!extractedText || extractedText.trim().length < 50) {
      await log('error', 'OCR produced insufficient text, falling back to extract method', 50);
      return parseDocument(fileBase64, fileType, documentType, onStep);
    }

    await log('structuring', 'Extracting structured data with AI...', 60, {
      textLength: extractedText.length,
      model: OPENROUTER_MODELS.FAST
    });

    // 4. Use AI to extract structured data from OCR text
    const prompt = isLogbookDocumentType(documentType)
      ? LOGBOOK_GEMINI_EXTRACTION_PROMPT
      : MAINTENANCE_GEMINI_EXTRACTION_PROMPT;

    let aiText: string;
    try {
      aiText = await generateCompletion({
        model: OPENROUTER_MODELS.FAST,
        userPrompt: `${prompt}\n\nDOCUMENT TEXT (from OCR):\n${extractedText}`,
        maxTokens: 65536,
        temperature: 0.1,
      });
    } catch (aiError: any) {
      if (aiError.message?.includes('quota') || aiError.message?.includes('429') || aiError.message?.includes('rate')) {
        await log('error', 'AI quota exceeded, using standard extraction', 60);
        return parseDocument(fileBase64, fileType, documentType, onStep);
      }
      throw aiError;
    }

    await log('structuring', 'AI extraction complete', 80);

    // 5. Parse the AI response
    const extracted = repairAndExtractEntries(aiText);

    if (!extracted) {
      await log('error', 'Failed to parse AI extraction response', 80);
      // Return empty result rather than failing entirely
      return buildParseResult([], {}, documentType, extractedText, startTime, 'hybrid-fast', log);
    }

    await log('validating_output', 'Validating extracted data...', 90, {
      entryCount: extracted.items.length
    });

    return buildParseResult(extracted.items, extracted.rawData, documentType, extractedText, startTime, 'hybrid-fast', log);

  } catch (error) {
    await log('error', `Fast processing failed: ${(error as Error).message}`, 0);
    return parseDocument(fileBase64, fileType, documentType, onStep);
  }
}

// Gemini-optimized extraction prompts (more concise for speed)
const LOGBOOK_GEMINI_EXTRACTION_PROMPT = `You are parsing OCR text from a pilot logbook. Extract ALL flight entries into JSON.

CRITICAL: Every flight entry MUST have totalTime (flight hours). This is required data - pilot logbooks always track time.

EXTRACT these fields for each flight:
- date: YYYY-MM-DD format (required)
- aircraftIdent: Tail number like N12345 (required)
- aircraftType: Make/model (C172, PA28, etc.)
- from, to: Airport codes (KRHV, KSJC, etc.)
- totalTime: Total flight hours in DECIMAL format (required - e.g., 1.5, 2.3). Look for the main time/duration column.
- sel: Single engine land hours (often equals totalTime for single-engine planes)
- mel: Multi engine land hours
- pic: PIC hours (often equals totalTime for certificated pilots)
- sic: SIC hours
- crossCountry: XC hours (flights > 50nm)
- night: Night flying hours
- actualInstrument, simulatedInstrument: IFR hours
- dualReceived: Instruction received hours
- dualGiven: Instruction given hours (CFI)
- landingsDay, landingsNight: Landing counts (integers)
- remarks: Notes, instructor names, endorsements

IMPORTANT:
- EVERY entry needs totalTime - if you see ANY time value in a row, use it
- Handle OCR errors: resolve ambiguous numbers (1/7, 0/O, 5/S) using context
- Times like 1.5, 2.0, 0.8 are common flight durations in hours
- Do NOT skip entries - extract all rows with dates

Output ONLY a JSON array, no markdown:
[{"date":"2024-01-15","aircraftIdent":"N12345","totalTime":1.5,"sel":1.5,"pic":1.5,"from":"KRHV","to":"KSJC"},...]`;

const MAINTENANCE_GEMINI_EXTRACTION_PROMPT = `Parse this aircraft maintenance log OCR text. Extract ALL entries.

CRITICAL: Extract EVERY entry even if there are hundreds. Keep descriptions brief (max 200 chars).

For each entry:
- date: YYYY-MM-DD
- description: Brief work summary (200 chars max)
- tachTime: Tach time
- mechanic: Name/cert#
- isInspection: true if inspection
- inspectionType: annual/100hour/transponder/static/elt

Top level: annualDate, hundredHourDate, transponderDate, staticDate, eltDate, currentTach, aircraftIdent

Output ONLY valid JSON:
{"entries":[{"date":"2024-01-15","description":"Annual inspection","isInspection":true,"inspectionType":"annual"}],"annualDate":"2024-01-15"}`;

export async function parseDocument(
  fileBase64: string,
  fileType: 'pdf' | 'image',
  documentType: string,  // Accepts any document type - internally maps to logbook or maintenance prompts
  onStep?: StepCallback
): Promise<ReductoResponse> {
  const apiKey = process.env.REDUCTO_API_KEY;
  const startTime = Date.now();
  const log = createStepLogger(startTime, onStep);

  if (!apiKey) {
    console.warn('Reducto API key not configured');
    await log('error', 'Reducto API key not configured', 0);
    return { success: false, error: 'Reducto API key not configured' };
  }

  try {
    await log('initializing', 'Initializing Reducto AI client...', 5, { documentType, fileType });

    const client = new Reducto({ apiKey });

    await log('preparing', 'Preparing document for upload...', 10, {
      sizeKB: Math.round(fileBase64.length * 0.75 / 1024),
      format: fileType
    });

    // 1. Upload File
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const filename = fileType === 'image' ? 'document.png' : 'document.pdf';

    const uploadTimeout = getScaledTimeout(REDUCTO_UPLOAD_TIMEOUT_BASE, fileBuffer.length);
    const extractTimeout = getScaledTimeout(REDUCTO_EXTRACT_TIMEOUT_BASE, fileBuffer.length);

    await log('uploading', `Uploading ${filename} to Reducto servers...`, 20, {
      filename,
      sizeBytes: fileBuffer.length,
      timeout: `${uploadTimeout / 1000}s`
    });

    const upload = await withTimeout(
      client.upload({
        file: await toFile(fileBuffer, filename),
        extension: fileType === 'image' ? 'png' : 'pdf',
      }),
      uploadTimeout,
      'Reducto upload'
    );

    await log('uploading', 'Document uploaded successfully', 35, {
      uploadId: typeof upload === 'string' ? upload : 'completed'
    });

    // 2. Prepare Prompt
    const isLogbook = isLogbookDocumentType(documentType);

    await log('preparing', 'Selecting optimal extraction prompt...', 40, {
      documentType,
      promptType: isLogbook ? 'LOGBOOK_EXTRACTION_PROMPT' : 'MAINTENANCE_EXTRACTION_PROMPT'
    });

    const prompt = isLogbook
      ? LOGBOOK_EXTRACTION_PROMPT
      : MAINTENANCE_EXTRACTION_PROMPT;

    await log('extracting', 'Sending document to Reducto AI for extraction...', 45, {
      model: 'reducto-extract',
      optimizeForLatency: true,
      timeout: `${extractTimeout / 1000}s`
    });

    // 3. Extract Structured Data
    await log('parsing', 'AI is analyzing document structure...', 55);

    const extraction = await withTimeout(
      client.extract.run({
        input: upload,
        instructions: {
          system_prompt: prompt,
        },
        settings: {
          optimize_for_latency: true
        }
      }),
      extractTimeout,
      'Reducto AI extraction'
    );

    await log('parsing', 'Document structure analyzed', 70);

    // 4. Adapt to internal format
    if ('job_id' in extraction && !('result' in extraction)) {
      await log('error', 'Received async job id but expected sync result', 70);
      return { success: false, error: 'Received async job id but expected sync result' };
    }

    await log('structuring', 'Structuring extracted data...', 80);

    const items = (extraction as any).result || [];
    await log('structuring', `Extracted ${items.length} ${isLogbook ? 'logbook' : 'maintenance'} entries`, 85, {
      entryCount: items.length,
      sampleFields: items[0] ? Object.keys(items[0]).slice(0, 5) : []
    });

    await log('validating_output', 'Validating extracted data...', 90);

    return buildParseResult(items, {}, documentType, '', startTime, 'reducto-extract', log);

  } catch (error) {
    await log('error', `Processing failed: ${(error as Error).message}`, 0, {
      errorType: (error as Error).name,
      errorMessage: (error as Error).message
    });
    return { success: false, error: (error as Error).message };
  }
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
export async function parsePOHFromUrl(pohUrl: string, onStep?: StepCallback): Promise<ReductoResponse> {
  const startTime = Date.now();
  const log = createStepLogger(startTime, onStep);

  try {
    const apiKey = process.env.REDUCTO_API_KEY;

    if (!apiKey) {
      await log('error', 'Reducto API key not configured', 0);
      return { success: false, error: 'Reducto API key not configured' };
    }

    await log('initializing', 'Initializing POH extraction...', 5, { url: pohUrl });

    // 1. Fetch PDF manually to avoid Reducto download issues
    await log('uploading', 'Downloading POH PDF...', 15);
    const response = await fetch(pohUrl);
    if (!response.ok) throw new Error(`Failed to fetch POH PDF: ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await log('uploading', 'POH downloaded successfully', 25, { sizeKB: Math.round(buffer.length / 1024) });

    const client = new Reducto({ apiKey });

    // Calculate dynamic timeouts based on file size
    const uploadTimeout = getScaledTimeout(REDUCTO_UPLOAD_TIMEOUT_BASE, buffer.length);
    const extractTimeout = getScaledTimeout(REDUCTO_EXTRACT_TIMEOUT_BASE, buffer.length);

    // 2. Upload
    await log('uploading', 'Uploading to Reducto...', 35);
    const upload = await withTimeout(
      client.upload({
        file: await toFile(buffer, 'poh.pdf'),
        extension: 'pdf'
      }),
      uploadTimeout,
      'Reducto upload'
    );

    await log('uploading', 'Upload complete', 45);

    // 3. Extract
    await log('extracting', 'Extracting V-speeds and weight limits...', 55);
    const extraction = await withTimeout(
      client.extract.run({
        input: upload,
        instructions: {
          system_prompt: POH_EXTRACTION_PROMPT
        }
      }),
      extractTimeout,
      'Reducto POH extraction'
    );

    await log('parsing', 'Parsing extraction results...', 75);

    if ('job_id' in extraction && !('result' in extraction)) {
      await log('error', 'Async job ID returned unexpectedly', 75);
      return { success: false, error: 'Async job ID returned' };
    }

    const res = (extraction as any).result;
    const data = res && res.length > 0 ? res[0] : {};

    await log('complete', 'POH extraction complete!', 100, {
      hasVSpeeds: !!data.vSpeeds,
      hasWeights: !!data.weights
    });

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

export function aggregateLogbookHours(entries: any[]): {
  totalHours: number;
  picHours: number;
  nightHours: number;
  ifrHours: number;
  crossCountryHours: number;
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
  let crossCountryHours = 0;
  let last90DaysHours = 0;
  let last30DaysHours = 0;

  for (const entry of entries) {
    const duration = entry.totalTime || entry.duration || 0;
    totalHours += duration;
    picHours += entry.pic || 0;
    nightHours += entry.night || 0;
    ifrHours += (entry.actualInstrument || 0) + (entry.simulatedInstrument || 0);
    crossCountryHours += entry.crossCountry || 0;

    if (entry.date) {
      const entryDate = new Date(entry.date);
      if (!isNaN(entryDate.getTime())) {
        if (entryDate >= ninetyDaysAgo) last90DaysHours += duration;
        if (entryDate >= thirtyDaysAgo) last30DaysHours += duration;
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
