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
import { ExtractRunResponse } from 'reductoai/resources/extract';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Gemini Flash for fast structured extraction
const GEMINI_FLASH_MODEL = 'gemini-2.0-flash';

// Timeout constants for API calls
const REDUCTO_UPLOAD_TIMEOUT = 30000;  // 30 seconds for upload
const REDUCTO_PARSE_TIMEOUT = 45000;   // 45 seconds for parse (OCR)
const REDUCTO_EXTRACT_TIMEOUT = 90000; // 90 seconds for extract (LLM)

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
  const geminiKey = process.env.GEMINI_API_KEY;
  const startTime = Date.now();

  const log = async (step: ProcessingStep, message: string, progress: number, details?: Record<string, any>) => {
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

  if (!geminiKey) {
    console.warn('[UltraFast] ⚠️ GEMINI_API_KEY not configured - falling back to slower Reducto OCR pipeline');
    console.warn('[UltraFast] Set GEMINI_API_KEY env var for 5-15 second parsing instead of 30-60+ seconds');
    await log('initializing', 'Gemini not configured, using OCR pipeline (slower)...', 5);
    return parseDocumentFast(fileBase64, fileType, documentType, onStep);
  }

  try {
    await log('initializing', 'Starting ultra-fast Gemini extraction...', 5, {
      documentType,
      fileType,
      mode: 'direct-vision'
    });

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_FLASH_MODEL });

    // Check file size - Gemini 2.0 can handle larger files inline
    const fileSizeBytes = Math.ceil((fileBase64.length * 3) / 4);
    const MAX_GEMINI_SIZE = 20 * 1024 * 1024; // 20MB - Gemini 2.0 handles this well

    if (fileSizeBytes > MAX_GEMINI_SIZE) {
      const sizeMB = (fileSizeBytes / 1024 / 1024).toFixed(1);
      console.warn(`[UltraFast] ⚠️ File too large (${sizeMB}MB > ${MAX_GEMINI_SIZE / 1024 / 1024}MB) - falling back to Reducto OCR`);
      await log('initializing', `File too large (${sizeMB}MB) for direct extraction, using OCR pipeline...`, 10);
      return parseDocumentFast(fileBase64, fileType, documentType, onStep);
    }

    await log('preparing', 'Preparing document for AI analysis...', 10, {
      sizeKB: Math.round(fileSizeBytes / 1024),
      format: fileType
    });

    // Choose the appropriate extraction prompt
    // Handle all logbook types (pilot_logbook, aircraft_logbook, logbook)
    const isLogbookType = documentType === 'logbook' || documentType.includes('logbook');
    const prompt = isLogbookType
      ? ULTRA_FAST_LOGBOOK_PROMPT
      : ULTRA_FAST_MAINTENANCE_PROMPT;

    const mimeType = fileType === 'pdf' ? 'application/pdf' : 'image/png';

    await log('extracting', 'Sending to Gemini Vision for direct extraction...', 20, {
      model: GEMINI_FLASH_MODEL,
      mode: 'vision-direct'
    });

    const extractionStart = Date.now();
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType,
          data: fileBase64
        }
      }
    ]);

    const extractionTime = Date.now() - extractionStart;
    await log('parsing', `AI extraction complete in ${(extractionTime / 1000).toFixed(1)}s`, 70, {
      extractionTimeMs: extractionTime
    });

    const response = await result.response;
    const aiText = response.text();

    console.log(`[UltraFast] ========== AI RAW RESPONSE ==========`);
    console.log(`[UltraFast] Response length: ${aiText.length} characters`);
    console.log(`[UltraFast] First 1000 chars:`, aiText.substring(0, 1000));
    console.log(`[UltraFast] Last 500 chars:`, aiText.substring(Math.max(0, aiText.length - 500)));
    console.log(`[UltraFast] =====================================`);

    await log('structuring', 'Parsing extracted data...', 80);

    // Parse the AI response
    let items: any[] = [];
    let rawData: any = {};

    try {
      // Clean up JSON - handle markdown code blocks and extra whitespace
      let jsonString = aiText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

      // Try to find JSON in the response if it's wrapped in other text
      const jsonMatch = jsonString.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
      }

      console.log(`[UltraFast] Cleaned JSON string length: ${jsonString.length}`);
      console.log(`[UltraFast] JSON preview:`, jsonString.substring(0, 500));

      const parsed = JSON.parse(jsonString);
      console.log(`[UltraFast] Parsed successfully! Type: ${Array.isArray(parsed) ? 'array' : 'object'}`);
      if (!Array.isArray(parsed)) {
        console.log(`[UltraFast] Object keys:`, Object.keys(parsed));
        if (parsed.entries) {
          console.log(`[UltraFast] Found entries array with ${parsed.entries.length} items`);
        }
      }

      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (parsed.entries && Array.isArray(parsed.entries)) {
        items = parsed.entries;
        // Extract top-level fields but exclude the entries array to avoid overwriting
        const { entries: _, ...rest } = parsed;
        rawData = rest;
      } else if (parsed.flights && Array.isArray(parsed.flights)) {
        items = parsed.flights;
        const { flights: _, ...rest } = parsed;
        rawData = rest;
      } else {
        items = [parsed];
        rawData = {};
      }
    } catch (parseError) {
      console.error('[UltraFast] ❌ JSON PARSE FAILED');
      console.error('[UltraFast] Error:', parseError);
      console.error('[UltraFast] Full AI response (first 2000 chars):', aiText.substring(0, 2000));
      console.error('[UltraFast] Full AI response (last 1000 chars):', aiText.substring(Math.max(0, aiText.length - 1000)));

      // Try multiple recovery strategies for truncated/malformed JSON
      let recovered = false;

      // Strategy 1: Try to find complete JSON object with entries
      const objectMatch = aiText.match(/\{[\s\S]*"entries"[\s\S]*\}/);
      if (objectMatch && !recovered) {
        console.log('[UltraFast] Found object pattern with entries, attempting to parse...');
        try {
          const cleanJson = objectMatch[0].replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
          const parsedObj = JSON.parse(cleanJson);
          if (parsedObj.entries && Array.isArray(parsedObj.entries)) {
            items = parsedObj.entries;
            const { entries: _, ...rest } = parsedObj;
            rawData = rest;
            console.log(`[UltraFast] ✓ Recovered ${items.length} entries from object pattern`);
            recovered = true;
          }
        } catch (e) {
          console.error('[UltraFast] Object pattern parse failed:', e);
        }
      }

      // Strategy 2: Try to find complete JSON array
      const arrayMatch = aiText.match(/\[\s*\{[\s\S]*?\}\s*(?:,\s*\{[\s\S]*?\}\s*)*\]/);
      if (arrayMatch && !recovered) {
        console.log('[UltraFast] Found array pattern, attempting to parse...');
        try {
          items = JSON.parse(arrayMatch[0]);
          console.log(`[UltraFast] ✓ Recovered ${items.length} entries from array pattern`);
          recovered = true;
        } catch (e) {
          console.error('[UltraFast] Array pattern parse failed:', e);
        }
      }

      // Strategy 3: Extract individual complete entries from truncated JSON using brace counting
      // This handles cases where the AI response was cut off mid-stream
      if (!recovered) {
        console.log('[UltraFast] Attempting truncated JSON recovery with brace counting...');
        const entriesMatch = aiText.match(/"entries"\s*:\s*\[([\s\S]*)/);
        const arrayStart = aiText.match(/^\s*\[([\s\S]*)/);
        const entriesText = entriesMatch ? entriesMatch[1] : (arrayStart ? arrayStart[1] : null);

        if (entriesText) {
          const completeEntries: any[] = [];
          let currentEntry = '';
          let braceCount = 0;
          let inString = false;
          let escapeNext = false;

          for (let i = 0; i < entriesText.length; i++) {
            const char = entriesText[i];

            if (escapeNext) {
              currentEntry += char;
              escapeNext = false;
              continue;
            }

            if (char === '\\') {
              escapeNext = true;
              currentEntry += char;
              continue;
            }

            if (char === '"') {
              inString = !inString;
            }

            currentEntry += char;

            if (!inString) {
              if (char === '{') {
                braceCount++;
              } else if (char === '}') {
                braceCount--;
                if (braceCount === 0 && currentEntry.trim().length > 0) {
                  // We have a complete entry
                  try {
                    const entry = JSON.parse(currentEntry.trim());
                    if (entry.date) { // Only add if it has a date
                      completeEntries.push(entry);
                    }
                  } catch (e) {
                    // Skip malformed entry
                  }
                  currentEntry = '';
                }
              }
            }
          }

          if (completeEntries.length > 0) {
            items = completeEntries;
            console.log(`[UltraFast] ✓ Recovered ${items.length} complete entries from truncated JSON!`);
            recovered = true;

            // Try to extract top-level fields too
            const annualMatch = aiText.match(/"annualDate"\s*:\s*"([^"]+)"/);
            const hundredHourMatch = aiText.match(/"hundredHourDate"\s*:\s*"([^"]+)"/);
            const transponderMatch = aiText.match(/"transponderDate"\s*:\s*"([^"]+)"/);
            const staticMatch = aiText.match(/"staticDate"\s*:\s*"([^"]+)"/);
            const eltMatch = aiText.match(/"eltDate"\s*:\s*"([^"]+)"/);
            const tachMatch = aiText.match(/"currentTach"\s*:\s*([0-9.]+)/);
            const hobbsMatch = aiText.match(/"currentHobbs"\s*:\s*([0-9.]+)/);

            rawData = {
              annualDate: annualMatch?.[1],
              hundredHourDate: hundredHourMatch?.[1],
              transponderDate: transponderMatch?.[1],
              staticDate: staticMatch?.[1],
              eltDate: eltMatch?.[1],
              currentTach: tachMatch ? parseFloat(tachMatch[1]) : undefined,
              currentHobbs: hobbsMatch ? parseFloat(hobbsMatch[1]) : undefined,
            };
            console.log('[UltraFast] Extracted additional fields:', Object.keys(rawData).filter(k => rawData[k] !== undefined));
          }
        }
      }

      if (!recovered) {
        console.error('[UltraFast] ❌ All recovery attempts failed');
        console.log('[UltraFast] Falling back to OCR pipeline...');
        await log('error', 'Could not parse AI response, falling back to OCR pipeline', 80);
        return parseDocumentFast(fileBase64, fileType, documentType, onStep);
      } else {
        await log('structuring', `Recovered ${items.length} entries from partial response`, 85);
      }
    }

    await log('validating_output', 'Validating extracted entries...', 90, {
      entryCount: items.length
    });

    console.log(`[UltraFast] ========== FINAL EXTRACTION RESULT ==========`);
    console.log(`[UltraFast] Document type: ${documentType}`);
    console.log(`[UltraFast] Total entries extracted: ${items.length}`);
    if (items.length > 0) {
      console.log(`[UltraFast] First entry:`, JSON.stringify(items[0], null, 2).substring(0, 300));
      console.log(`[UltraFast] Last entry:`, JSON.stringify(items[items.length - 1], null, 2).substring(0, 300));
    } else {
      console.error(`[UltraFast] ❌ NO ENTRIES EXTRACTED - THIS IS A PROBLEM!`);
    }
    if (Object.keys(rawData).length > 0) {
      console.log(`[UltraFast] Additional fields:`, Object.keys(rawData));
      console.log(`[UltraFast] Additional data:`, JSON.stringify(rawData, null, 2).substring(0, 500));
    }
    console.log(`[UltraFast] ============================================`);

    // Calculate stats
    let totalHours = 0;
    if (documentType === 'logbook') {
      totalHours = items.reduce((sum: number, entry: any) => {
        return sum + (parseFloat(entry.totalTime) || parseFloat(entry.duration) || 0);
      }, 0);
    }

    const totalDuration = Date.now() - startTime;
    await log('complete', 'Document processing complete!', 100, {
      entryCount: items.length,
      totalHours: documentType === 'logbook' ? Math.round(totalHours * 10) / 10 : undefined,
      processingTimeMs: totalDuration,
      success: true,
      mode: 'ultra-fast-vision'
    });

    console.log(`[UltraFast] Completed in ${(totalDuration / 1000).toFixed(1)}s - ${items.length} entries extracted`);

    return {
      success: true,
      data: {
        documentType: documentType,
        extractedData: { entries: items, ...rawData },
        confidence: 1.0,
        rawText: '',
      },
    };

  } catch (error) {
    const errorMsg = (error as Error).message || 'Unknown error';
    console.error('[UltraFast] ❌ Gemini extraction failed:', errorMsg);
    console.error('[UltraFast] Full error:', error);
    await log('error', `Gemini extraction failed: ${errorMsg}. Falling back to OCR...`, 10);

    // Fall back to the OCR-based method
    console.log('[UltraFast] Falling back to Reducto OCR pipeline...');
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

const ULTRA_FAST_MAINTENANCE_PROMPT = `You are extracting maintenance entries from an aircraft maintenance log. Extract ALL visible maintenance entries.

For EACH maintenance entry, extract:
- date: YYYY-MM-DD format
- description: Full work description
- hobbsTime: Aircraft hobbs time (if shown)
- tachTime: Tachometer time (if shown)
- mechanic: Mechanic name or certificate number
- signedOff: true/false if properly signed
- isInspection: true if this is an inspection
- inspectionType: "annual", "100hour", "transponder", "static", "elt" if applicable

Also extract at the top level (outside entries array):
- annualDate: Most recent annual inspection date
- hundredHourDate: Most recent 100-hour inspection date
- transponderDate: Most recent transponder check date
- staticDate: Most recent static system check date
- eltDate: Most recent ELT inspection date
- currentHobbs: Latest hobbs time recorded
- currentTach: Latest tach time recorded
- aircraftIdent: Aircraft tail number if visible

IMPORTANT:
- Extract EVERY entry you can see
- Output ONLY valid JSON, no markdown:

{"entries":[{"date":"2024-01-15","description":"Annual Inspection",...}],"annualDate":"2024-01-15","currentHobbs":1234.5}`;

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
  const geminiKey = process.env.GEMINI_API_KEY;
  const startTime = Date.now();

  const log = async (step: ProcessingStep, message: string, progress: number, details?: Record<string, any>) => {
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

  if (!apiKey) {
    console.warn('Reducto API key not configured');
    await log('error', 'Reducto API key not configured', 0);
    return { success: false, error: 'Reducto API key not configured' };
  }

  if (!geminiKey) {
    console.warn('Gemini API key not configured, falling back to slow extraction');
    // Fall back to original slow method
    return parseDocument(fileBase64, fileType, documentType, onStep);
  }

  try {
    const fileSizeBytes = Math.ceil((fileBase64.length * 3) / 4);
    const fileSizeMB = (fileSizeBytes / 1024 / 1024).toFixed(1);

    console.log(`[FastParse] Starting Reducto OCR pipeline for ${fileSizeMB}MB ${documentType} document`);
    await log('initializing', `Initializing OCR pipeline (${fileSizeMB}MB ${documentType})...`, 5, {
      documentType,
      fileType,
      mode: 'hybrid',
      fileSizeMB: parseFloat(fileSizeMB)
    });

    const client = new Reducto({ apiKey });
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_FLASH_MODEL });

    await log('preparing', 'Preparing document for OCR...', 10, {
      sizeKB: Math.round(fileSizeBytes / 1024),
      format: fileType
    });

    // 1. Upload file to Reducto
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const filename = fileType === 'image' ? 'document.png' : 'document.pdf';

    await log('uploading', `Uploading ${filename} to Reducto...`, 15, {
      filename,
      sizeBytes: fileBuffer.length
    });

    const uploadStart = Date.now();
    const upload = await withTimeout(
      client.upload({
        file: await toFile(fileBuffer, filename),
        extension: fileType === 'image' ? 'png' : 'pdf',
      }),
      REDUCTO_UPLOAD_TIMEOUT,
      'Reducto upload'
    );

    await log('uploading', `Document uploaded in ${((Date.now() - uploadStart) / 1000).toFixed(1)}s`, 25);

    // 2. Use parse endpoint (fast OCR) instead of extract (slow LLM)
    await log('extracting', 'Running fast OCR (Reducto Parse)...', 30, {
      model: 'reducto-parse',
      mode: 'ocr-only',
      timeout: `${REDUCTO_PARSE_TIMEOUT / 1000}s`
    });

    const parseStart = Date.now();
    const parseResult = await withTimeout(
      client.parse.run({
        input: upload,
        enhance: {
          summarize_figures: false,    // Disable figure summaries (adds latency)
        },
        retrieval: {
          chunking: {
            chunk_mode: 'disabled',    // Get all content in one chunk
          }
        },
        settings: {
          timeout: Math.floor(REDUCTO_PARSE_TIMEOUT / 1000),  // Server-side timeout in seconds
          ocr_system: 'standard',      // Use standard OCR (faster than legacy)
        }
      }),
      REDUCTO_PARSE_TIMEOUT + 5000,  // Client timeout slightly longer than server
      'Reducto OCR parse'
    );

    const ocrDuration = Date.now() - startTime;
    await log('parsing', `OCR complete in ${(ocrDuration / 1000).toFixed(1)}s`, 50, {
      ocrTimeMs: ocrDuration
    });

    // 3. Extract text content from parse result
    // Handle async job_id response (shouldn't happen with sync call but be safe)
    if ('job_id' in parseResult && !('result' in parseResult)) {
      await log('error', 'Received async job id but expected sync result', 50);
      return parseDocument(fileBase64, fileType, documentType, onStep);
    }

    let extractedText = '';
    const parseData = (parseResult as any).result;

    // Handle FullResult type (has chunks array)
    if (parseData?.type === 'full' && parseData?.chunks) {
      extractedText = parseData.chunks
        .map((chunk: any) => {
          // Each chunk has blocks and content
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
      // URL result - need to fetch the content
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
      } catch (fetchError) {
        console.error('Failed to fetch URL result:', fetchError);
      }
    }

    if (!extractedText || extractedText.trim().length < 50) {
      await log('error', 'OCR produced insufficient text, falling back to extract method', 50);
      // Fall back to the slower extract method
      return parseDocument(fileBase64, fileType, documentType, onStep);
    }

    await log('structuring', 'Extracting structured data with Gemini Flash...', 60, {
      textLength: extractedText.length,
      model: GEMINI_FLASH_MODEL
    });

    // 4. Use Gemini Flash to extract structured data from OCR text
    // Handle all logbook types (pilot_logbook, aircraft_logbook, logbook)
    const isLogbookType = documentType === 'logbook' || documentType.includes('logbook');
    const prompt = isLogbookType
      ? LOGBOOK_GEMINI_EXTRACTION_PROMPT
      : MAINTENANCE_GEMINI_EXTRACTION_PROMPT;

    const result = await model.generateContent([
      prompt,
      `\n\nDOCUMENT TEXT (from OCR):\n${extractedText}`
    ]);

    const response = await result.response;
    const aiText = response.text();

    console.log(`[FastParse] ========== AI RAW RESPONSE ==========`);
    console.log(`[FastParse] Response length: ${aiText.length} characters`);
    console.log(`[FastParse] First 1000 chars:`, aiText.substring(0, 1000));
    console.log(`[FastParse] Last 500 chars:`, aiText.substring(Math.max(0, aiText.length - 500)));
    console.log(`[FastParse] =========================================`);

    await log('structuring', 'AI extraction complete', 80);

    // 5. Parse the AI response
    let items: any[] = [];
    let rawData: any = {};
    try {
      // Clean up JSON - handle markdown code blocks and extra whitespace
      let jsonString = aiText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

      // Try to find JSON in the response if it's wrapped in other text
      const jsonMatch = jsonString.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
      }

      console.log(`[FastParse] Cleaned JSON string length: ${jsonString.length}`);
      console.log(`[FastParse] JSON preview:`, jsonString.substring(0, 500));

      const parsed = JSON.parse(jsonString);
      console.log(`[FastParse] ✓ Parsed successfully! Type: ${Array.isArray(parsed) ? 'array' : 'object'}`);

      if (!Array.isArray(parsed)) {
        console.log(`[FastParse] Object keys:`, Object.keys(parsed));
        if (parsed.entries) {
          console.log(`[FastParse] Found entries array with ${parsed.entries.length} items`);
        }
      }

      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (parsed.entries && Array.isArray(parsed.entries)) {
        items = parsed.entries;
        const { entries: _, ...rest } = parsed;
        rawData = rest;
      } else if (parsed.flights && Array.isArray(parsed.flights)) {
        items = parsed.flights;
        const { flights: _, ...rest } = parsed;
        rawData = rest;
      } else {
        items = [parsed];
      }
    } catch (parseError) {
      console.error('[FastParse] ❌ JSON PARSE FAILED');
      console.error('[FastParse] Error:', parseError);
      console.error('[FastParse] Full response (first 2000 chars):', aiText.substring(0, 2000));
      console.error('[FastParse] Full response (last 1000 chars):', aiText.substring(Math.max(0, aiText.length - 1000)));

      // Try multiple recovery strategies for truncated/malformed JSON
      let recovered = false;

      // Strategy 1: Try to find complete JSON object with entries
      const objectMatch = aiText.match(/\{[\s\S]*"entries"[\s\S]*\}/);
      if (objectMatch && !recovered) {
        console.log('[FastParse] Found object pattern with entries, attempting to parse...');
        try {
          const cleanJson = objectMatch[0].replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
          const parsedObj = JSON.parse(cleanJson);
          if (parsedObj.entries && Array.isArray(parsedObj.entries)) {
            items = parsedObj.entries;
            const { entries: _, ...rest } = parsedObj;
            rawData = rest;
            console.log(`[FastParse] ✓ Recovered ${items.length} entries from object pattern`);
            recovered = true;
          }
        } catch (e) {
          console.error('[FastParse] Object pattern parse failed:', e);
        }
      }

      // Strategy 2: Try to find complete JSON array
      const arrayMatch = aiText.match(/\[\s*\{[\s\S]*?\}\s*(?:,\s*\{[\s\S]*?\}\s*)*\]/);
      if (arrayMatch && !recovered) {
        console.log('[FastParse] Found array pattern, attempting to parse...');
        try {
          items = JSON.parse(arrayMatch[0]);
          console.log(`[FastParse] ✓ Recovered ${items.length} entries from array pattern`);
          recovered = true;
        } catch (e) {
          console.error('[FastParse] Array pattern parse failed:', e);
        }
      }

      // Strategy 3: Extract individual complete entries from truncated JSON using brace counting
      // This handles cases where the AI response was cut off mid-stream
      if (!recovered) {
        console.log('[FastParse] Attempting truncated JSON recovery with brace counting...');
        const entriesMatch = aiText.match(/"entries"\s*:\s*\[([\s\S]*)/);
        const arrayStart = aiText.match(/^\s*\[([\s\S]*)/);
        const entriesText = entriesMatch ? entriesMatch[1] : (arrayStart ? arrayStart[1] : null);

        if (entriesText) {
          const completeEntries: any[] = [];
          let currentEntry = '';
          let braceCount = 0;
          let inString = false;
          let escapeNext = false;

          for (let i = 0; i < entriesText.length; i++) {
            const char = entriesText[i];

            if (escapeNext) {
              currentEntry += char;
              escapeNext = false;
              continue;
            }

            if (char === '\\') {
              escapeNext = true;
              currentEntry += char;
              continue;
            }

            if (char === '"') {
              inString = !inString;
            }

            currentEntry += char;

            if (!inString) {
              if (char === '{') {
                braceCount++;
              } else if (char === '}') {
                braceCount--;
                if (braceCount === 0 && currentEntry.trim().length > 0) {
                  // We have a complete entry
                  try {
                    const entry = JSON.parse(currentEntry.trim());
                    if (entry.date) { // Only add if it has a date
                      completeEntries.push(entry);
                    }
                  } catch (e) {
                    // Skip malformed entry
                  }
                  currentEntry = '';
                }
              }
            }
          }

          if (completeEntries.length > 0) {
            items = completeEntries;
            console.log(`[FastParse] ✓ Recovered ${items.length} complete entries from truncated JSON!`);
            recovered = true;

            // Try to extract top-level fields too
            const annualMatch = aiText.match(/"annualDate"\s*:\s*"([^"]+)"/);
            const hundredHourMatch = aiText.match(/"hundredHourDate"\s*:\s*"([^"]+)"/);
            const transponderMatch = aiText.match(/"transponderDate"\s*:\s*"([^"]+)"/);
            const staticMatch = aiText.match(/"staticDate"\s*:\s*"([^"]+)"/);
            const eltMatch = aiText.match(/"eltDate"\s*:\s*"([^"]+)"/);
            const tachMatch = aiText.match(/"currentTach"\s*:\s*([0-9.]+)/);
            const hobbsMatch = aiText.match(/"currentHobbs"\s*:\s*([0-9.]+)/);

            rawData = {
              annualDate: annualMatch?.[1],
              hundredHourDate: hundredHourMatch?.[1],
              transponderDate: transponderMatch?.[1],
              staticDate: staticMatch?.[1],
              eltDate: eltMatch?.[1],
              currentTach: tachMatch ? parseFloat(tachMatch[1]) : undefined,
              currentHobbs: hobbsMatch ? parseFloat(hobbsMatch[1]) : undefined,
            };
            console.log('[FastParse] Extracted additional fields:', Object.keys(rawData).filter(k => rawData[k] !== undefined));
          }
        }
      }

      if (!recovered) {
        console.error('[FastParse] ❌ All recovery attempts failed, returning empty array');
        await log('error', 'Failed to parse AI extraction response', 80);
      } else {
        await log('structuring', `Recovered ${items.length} entries from partial response`, 85);
      }
    }

    await log('validating_output', 'Validating extracted data...', 90, {
      entryCount: items.length
    });

    // Calculate stats
    let totalHours = 0;
    if (documentType === 'logbook') {
      totalHours = items.reduce((sum: number, entry: any) => {
        return sum + (parseFloat(entry.totalTime) || parseFloat(entry.duration) || 0);
      }, 0);
    }

    const totalDuration = Date.now() - startTime;
    await log('complete', 'Document processing complete!', 100, {
      entryCount: items.length,
      totalHours: documentType === 'logbook' ? Math.round(totalHours * 10) / 10 : undefined,
      processingTimeMs: totalDuration,
      success: true,
      mode: 'hybrid-fast'
    });

    console.log(`[FastParse] ========== FINAL EXTRACTION RESULT ==========`);
    console.log(`[FastParse] Document type: ${documentType}`);
    console.log(`[FastParse] Total entries extracted: ${items.length}`);
    console.log(`[FastParse] Processing time: ${(totalDuration / 1000).toFixed(1)}s (OCR: ${(ocrDuration / 1000).toFixed(1)}s)`);
    if (items.length > 0) {
      console.log(`[FastParse] First entry:`, JSON.stringify(items[0], null, 2).substring(0, 300));
      console.log(`[FastParse] Last entry:`, JSON.stringify(items[items.length - 1], null, 2).substring(0, 300));
    } else {
      console.error(`[FastParse] ❌ NO ENTRIES EXTRACTED - THIS IS A PROBLEM!`);
    }
    if (Object.keys(rawData).length > 0) {
      console.log(`[FastParse] Additional fields:`, Object.keys(rawData));
      console.log(`[FastParse] Additional data:`, JSON.stringify(rawData, null, 2).substring(0, 500));
    }
    console.log(`[FastParse] ===============================================`);

    return {
      success: true,
      data: {
        documentType: documentType,
        extractedData: { entries: items, ...rawData },
        confidence: 1.0,
        rawText: extractedText,
      },
    };

  } catch (error) {
    console.error('Fast parse error:', error);
    await log('error', `Fast processing failed: ${(error as Error).message}`, 0);

    // Fall back to the slower but more reliable extract method
    console.log('[FastParse] Falling back to standard extraction method...');
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

const MAINTENANCE_GEMINI_EXTRACTION_PROMPT = `You are parsing OCR text from an aircraft maintenance log. Extract ALL maintenance entries into JSON.

EXTRACT these fields for each entry (include only fields with values):
- date: YYYY-MM-DD format
- description: Full work description
- hobbsTime, tachTime: Aircraft times
- mechanic: Mechanic name/certificate
- signedOff: boolean
- isInspection: boolean
- inspectionType: "annual" | "100hour" | "transponder" | "static" | "elt" if applicable

Also extract at top level:
- annualDate, hundredHourDate, transponderDate, staticDate, eltDate: Most recent inspection dates
- currentHobbs, currentTach: Latest recorded times
- aircraftIdent: Tail number if found

Output ONLY valid JSON, no markdown:
{"entries":[...],"annualDate":"2024-01-15","currentHobbs":1234.5,...}`;

export async function parseDocument(
  fileBase64: string,
  fileType: 'pdf' | 'image',
  documentType: string,  // Accepts any document type - internally maps to logbook or maintenance prompts
  onStep?: StepCallback
): Promise<ReductoResponse> {
  const apiKey = process.env.REDUCTO_API_KEY;
  const startTime = Date.now();

  const log = async (step: ProcessingStep, message: string, progress: number, details?: Record<string, any>) => {
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

  if (!apiKey) {
    console.warn('Reducto API key not configured');
    await log('error', 'Reducto API key not configured', 0);
    return {
      success: false,
      error: 'Reducto API key not configured',
    };
  }

  try {
    await log('initializing', 'Initializing Reducto AI client...', 5, { documentType, fileType });

    const client = new Reducto({ apiKey });

    await log('preparing', 'Preparing document for upload...', 10, {
      sizeKB: Math.round(fileBase64.length * 0.75 / 1024),
      format: fileType
    });

    // 1. Upload File using helper
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const filename = fileType === 'image' ? 'document.png' : 'document.pdf';

    await log('uploading', `Uploading ${filename} to Reducto servers...`, 20, {
      filename,
      sizeBytes: fileBuffer.length,
      timeout: `${REDUCTO_UPLOAD_TIMEOUT / 1000}s`
    });

    const upload = await withTimeout(
      client.upload({
        file: await toFile(fileBuffer, filename),
        extension: fileType === 'image' ? 'png' : 'pdf',
      }),
      REDUCTO_UPLOAD_TIMEOUT,
      'Reducto upload'
    );

    await log('uploading', 'Document uploaded successfully', 35, {
      uploadId: typeof upload === 'string' ? upload : 'completed'
    });

    // 2. Prepare Prompt
    // Handle all logbook types (pilot_logbook, aircraft_logbook, logbook)
    const isLogbookType = documentType === 'logbook' || documentType.includes('logbook');

    await log('preparing', 'Selecting optimal extraction prompt...', 40, {
      documentType,
      promptType: isLogbookType ? 'LOGBOOK_EXTRACTION_PROMPT' : 'MAINTENANCE_EXTRACTION_PROMPT'
    });

    const prompt = isLogbookType
      ? LOGBOOK_EXTRACTION_PROMPT
      : MAINTENANCE_EXTRACTION_PROMPT;

    await log('extracting', 'Sending document to Reducto AI for extraction...', 45, {
      model: 'reducto-extract',
      optimizeForLatency: true,
      timeout: `${REDUCTO_EXTRACT_TIMEOUT / 1000}s`
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
          optimize_for_latency: true,  // Use faster processing at higher cost
        }
      }),
      REDUCTO_EXTRACT_TIMEOUT,
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
    let extractedData: Record<string, any> = {};

    if (documentType === 'logbook') {
      extractedData = { entries: items };
      await log('structuring', `Extracted ${items.length} logbook entries`, 85, {
        entryCount: items.length,
        sampleFields: items[0] ? Object.keys(items[0]).slice(0, 5) : []
      });
    } else {
      extractedData = { entries: items };
      await log('structuring', `Extracted ${items.length} maintenance entries`, 85, {
        entryCount: items.length,
        sampleFields: items[0] ? Object.keys(items[0]).slice(0, 5) : []
      });
    }

    await log('validating_output', 'Validating extracted data...', 90);

    // Calculate some stats for logging
    const entryCount = items.length;
    let totalHours = 0;
    if (documentType === 'logbook') {
      totalHours = items.reduce((sum: number, entry: any) => {
        return sum + (parseFloat(entry.totalTime) || parseFloat(entry.duration) || 0);
      }, 0);
    }

    await log('validating_output', 'Data validation complete', 95, {
      entryCount,
      totalHours: documentType === 'logbook' ? Math.round(totalHours * 10) / 10 : undefined,
      confidence: 1.0
    });

    await log('complete', 'Document processing complete!', 100, {
      entryCount,
      processingTimeMs: Date.now() - startTime,
      success: true
    });

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
    await log('error', `Processing failed: ${(error as Error).message}`, 0, {
      errorType: (error as Error).name,
      errorMessage: (error as Error).message
    });
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
export async function parsePOHFromUrl(pohUrl: string, onStep?: StepCallback): Promise<ReductoResponse> {
  const startTime = Date.now();

  const log = async (step: ProcessingStep, message: string, progress: number, details?: Record<string, any>) => {
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

    // 2. Upload
    await log('uploading', 'Uploading to Reducto...', 35);
    const upload = await withTimeout(
      client.upload({
        file: await toFile(buffer, 'poh.pdf'),
        extension: 'pdf'
      }),
      REDUCTO_UPLOAD_TIMEOUT,
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
      REDUCTO_EXTRACT_TIMEOUT,
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
  fileType: 'pdf' | 'image',
  onStep?: StepCallback
): Promise<{ success: boolean; analysis?: DocumentAnalysis; error?: string }> {
  const apiKey = process.env.REDUCTO_API_KEY;
  const startTime = Date.now();

  const log = async (step: ProcessingStep, message: string, progress: number, details?: Record<string, any>) => {
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

  if (!apiKey) {
    console.warn('Reducto API key not configured');
    await log('error', 'Reducto API key not configured', 0);
    return {
      success: false,
      error: 'Reducto API key not configured',
    };
  }

  try {
    await log('initializing', 'Initializing document analysis...', 5);

    const client = new Reducto({ apiKey });

    await log('preparing', 'Preparing document for analysis...', 10);

    // Upload file
    const fileBuffer = Buffer.from(fileBase64, 'base64');

    await log('uploading', 'Uploading document for classification...', 20, {
      sizeKB: Math.round(fileBuffer.length / 1024)
    });

    const upload = await withTimeout(
      client.upload({
        file: await toFile(fileBuffer, fileType === 'image' ? 'document.png' : 'document.pdf'),
        extension: fileType === 'image' ? 'png' : 'pdf',
      }),
      REDUCTO_UPLOAD_TIMEOUT,
      'Reducto upload'
    );

    await log('uploading', 'Document uploaded successfully', 35);

    // Run analysis extraction
    await log('classifying', 'AI is classifying document type...', 45);

    const extraction = await withTimeout(
      client.extract.run({
        input: upload,
        instructions: {
          system_prompt: DOCUMENT_ANALYSIS_PROMPT,
        },
        settings: {
          optimize_for_latency: true
        }
      }),
      REDUCTO_EXTRACT_TIMEOUT,
      'Reducto document analysis'
    );

    await log('analyzing', 'Processing classification results...', 70);

    if ('job_id' in extraction && !('result' in extraction)) {
      await log('error', 'Received async job id but expected sync result', 70);
      return { success: false, error: 'Received async job id but expected sync result' };
    }

    const items = (extraction as any).result || [];
    const analysisResult = items.length > 0 ? items[0] : null;

    if (!analysisResult) {
      // Fallback analysis if extraction returns empty
      await log('analyzing', 'Using fallback analysis (limited data)', 85);
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

    await log('complete', 'Document analysis complete!', 100, {
      detectedType: analysis.detectedType,
      confidence: analysis.confidence,
      quality: analysis.documentQuality,
      isHandwritten: analysis.isHandwritten,
      estimatedEntries: analysis.estimatedEntryCount
    });

    return {
      success: true,
      analysis
    };

  } catch (error) {
    console.error('Document analysis error:', error);
    await log('error', `Analysis failed: ${(error as Error).message}`, 0);
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
