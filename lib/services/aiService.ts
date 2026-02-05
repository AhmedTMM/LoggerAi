import {
  isOpenRouterConfigured,
  generateVisionCompletion,
  generateCompletion,
  parseJsonResponse,
  OPENROUTER_MODELS,
} from './openRouterClient';
import { DetectedDocumentType } from '@/lib/models/ParsedDocument';

// Document classification result type with expanded types
export interface FastDocumentClassification {
  detectedType: DetectedDocumentType;
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
  // For auto-attachment matching
  matchedPilotName?: string;    // Exact pilot name found in document
  matchedAircraftTails?: string[]; // Tail numbers found in document
}

/**
 * Fast document classification using AI vision
 * Analyzes document images/PDFs to determine type without heavy extraction
 * Target: Under 10 seconds for classification
 */
export async function classifyDocumentFast(
  fileBase64: string,
  fileType: 'pdf' | 'image'
): Promise<{ success: boolean; classification?: FastDocumentClassification; error?: string }> {
  const startTime = Date.now();

  try {
    if (!isOpenRouterConfigured()) {
      throw new Error("Missing OPENROUTER_API_KEY");
    }

    // For large files, skip classification - truncating PDFs creates invalid documents
    const MAX_CLASSIFIABLE_SIZE = 25 * 1024 * 1024; // 25MB max for classification (~19MB actual file)

    if (fileBase64.length > MAX_CLASSIFIABLE_SIZE) {
      const fileSizeMB = (fileBase64.length / 1024 / 1024).toFixed(1);
      console.log(`[FastClassify] File too large for classification (${fileSizeMB}MB > ${(MAX_CLASSIFIABLE_SIZE / 1024 / 1024).toFixed(1)}MB). Using default classification.`);
      // Return a default classification for very large files
      // Large PDFs are often pilot logbooks (multi-page scans)
      return {
        success: true,
        classification: {
          detectedType: 'logbook' as const, // Assume logbook for large multi-page PDFs
          confidence: 0.5,
          suggestedName: `Logbook ${new Date().toISOString().split('T')[0]}`,
          estimatedEntryCount: 100, // Estimate for large file
          documentQuality: 'fair' as const,
          qualityNotes: [`Large file (${fileSizeMB}MB) - classification skipped, assumed logbook`],
          isHandwritten: true, // Likely handwritten if it's a scanned logbook
          summary: `Large document (${fileSizeMB}MB) - assumed pilot logbook based on size`,
        }
      };
    }

    const prompt = `You are an expert aviation document classifier. Analyze this document quickly and identify its type.

DOCUMENT TYPES (choose the most specific match):

PILOT-RELATED DOCUMENTS:
- pilot_logbook: Personal pilot flight logbook with dates, aircraft, times (SEL, MEL, PIC), landings, remarks
- medical: FAA medical certificate showing class, date, pilot name
- certificate: Pilot certificate/license (PPL, CPL, ATP, Sport Pilot)
- endorsement: Instructor endorsements for training (solo, checkride, etc.)
- checkout: Aircraft checkout form or proficiency check record

AIRCRAFT-RELATED DOCUMENTS:
- aircraft_logbook: Aircraft's own flight/journey logbook tracking hours on the airframe
- maintenance: Maintenance records with work descriptions, mechanic signatures
- inspection: Specific inspection records (annual, 100-hour, progressive)
- poh: Pilot Operating Handbook with V-speeds, performance, emergency procedures
- weight_balance: Weight & balance sheets or calculations
- insurance: Aircraft insurance documents
- registration: FAA aircraft registration (N-number documentation)
- ad_compliance: Airworthiness Directive compliance records
- service_bulletin: Service bulletin compliance documentation

OTHER:
- logbook: Generic logbook if you can't distinguish pilot vs aircraft
- other: Cannot determine or doesn't fit above categories
- unknown: Completely unrecognizable

CLASSIFICATION TIPS - VERY IMPORTANT:
- PILOT LOGBOOK: Look for TABULAR structure with multiple rows of flight entries. Key indicators:
  * Multiple columns with headers like: DATE, AIRCRAFT (tail numbers like N12345), FROM/TO (airport codes like KRHV, KLAX), TIME columns
  * Rows of flight entries with dates, often handwritten
  * Time columns may show decimal hours (1.5, 2.3) or hours:minutes
  * May be on standard Jeppesen, ASA, or generic logbook paper with pre-printed column headers
  * EVEN IF HANDWRITTEN OR SCANNED QUALITY - if it has flight date/aircraft/airport/time structure, it's a pilot_logbook
  * The presence of MULTIPLE DIFFERENT tail numbers (N-numbers) strongly indicates pilot logbook (not aircraft logbook)
- AIRCRAFT LOGBOOK: Tracks a SINGLE aircraft's airframe/engine hours. Has "Aircraft Log" title, ONE tail number throughout
- Look for pilot NAME on cover of pilot logbooks
- Maintenance records have mechanic names, A&P numbers, work performed descriptions
- When in doubt between pilot_logbook and other for a document with flight entries, choose pilot_logbook

Output ONLY valid JSON (no markdown):
{
  "detectedType": "pilot_logbook" | "aircraft_logbook" | "maintenance" | "inspection" | "poh" | "weight_balance" | "insurance" | "registration" | "medical" | "certificate" | "endorsement" | "checkout" | "ad_compliance" | "service_bulletin" | "logbook" | "other" | "unknown",
  "confidence": 0.0-1.0,
  "suggestedName": "Descriptive name based on content",
  "pilotName": "Full pilot name if visible (for pilot documents)",
  "aircraftTailNumbers": ["N12345", "N67890"],
  "dateRange": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"},
  "estimatedEntryCount": 50,
  "documentQuality": "excellent" | "good" | "fair" | "poor",
  "qualityNotes": ["Handwritten", "Some faded text", "Multi-page scan"],
  "isHandwritten": true/false,
  "pageCount": 10,
  "summary": "Brief 1-2 sentence description",
  "matchedPilotName": "Exact pilot name found (null if none)",
  "matchedAircraftTails": ["N12345"]
}`;

    const mimeType = fileType === 'pdf' ? 'application/pdf' : 'image/png';

    const response = await generateVisionCompletion({
      model: OPENROUTER_MODELS.FAST,
      userPrompt: prompt,
      imageBase64: fileBase64,
      mimeType,
    });

    let classification: FastDocumentClassification;
    try {
      classification = parseJsonResponse(response);
      // Normalize legacy types to new types
      if (classification.detectedType === 'logbook' && classification.pilotName) {
        classification.detectedType = 'pilot_logbook';
      }
    } catch (parseError) {
      console.error('[FastClassify] Failed to parse AI response:', response);
      // Return a fallback classification
      classification = {
        detectedType: 'unknown',
        confidence: 0.3,
        suggestedName: `Document_${Date.now()}`,
        estimatedEntryCount: 0,
        documentQuality: 'fair',
        qualityNotes: ['Could not fully analyze document'],
        isHandwritten: false,
        summary: 'Document type could not be determined',
        matchedPilotName: undefined,
        matchedAircraftTails: []
      };
    }

    const duration = Date.now() - startTime;
    console.log(`[FastClassify] Completed in ${duration}ms - Type: ${classification.detectedType}, Confidence: ${classification.confidence}`);

    return {
      success: true,
      classification
    };

  } catch (error) {
    console.error('[FastClassify] Error:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

interface LogbookEntry {
    date: string;
    aircraftIdent: string;
    aircraftType?: string;
    from: string;
    to: string;
    totalTime: number;
    pic?: number;
    sic?: number;
    solo?: number;
    dualReceived?: number;
    dualGiven?: number;
    crossCountry?: number;
    night?: number;
    actualInstrument?: number;
    simulatedInstrument?: number;
    sel?: number;
    mel?: number;
    landingsDay?: number;
    landingsNight?: number;
    remarks?: string;
}

interface GeneratedPilotProfile {
    name: string;
    email: string;
    certificates: {
        type: 'Student' | 'PPL' | 'CPL' | 'ATP' | 'Sport';
        instrumentRated: boolean;
        multiEngineRated: boolean;
    };
    endorsements: {
        type: 'High Performance' | 'Complex' | 'Tailwheel' | 'High Altitude';
        date: string;
        instructor: string;
    }[];
    experience: {
        totalHours: number;
        picHours: number;
        nightHours: number;
        ifrHours: number;
        crossCountryHours: number;
        last90DaysHours: number;
        last30DaysHours: number;
    };
    medicalExpiration: string;
    flightReviewExpiration: string;
    flightEntries: LogbookEntry[];
    profileAnalysis: {
        pilotCategory: string;
        strengthAreas: string[];
        developmentAreas: string[];
        recommendations: string[];
        experienceSummary: string;
    };
}

interface PilotData {
    name: string;
    experience: any;
    certificates: any;
    flightEntries: any[];
}

interface AircraftData {
    tailNumber: string;
    manufacturer: string;
    model: string;
    year: number;
    currentHours: { hobbs: number; tach: number };
    maintenanceDates: any;
    logs?: any[];
    safetyAnalysis?: any;
}

export async function analyzePilotSafety(pilot: PilotData) {
    // 1. Prepare Data Context
    // We want to minimize token usage while giving enough context.
    // Extract last 20 flights or significant ones? Let's take last 30 for trend analysis.
    // Also extract unique airports to give regional context.

    const recentFlights = (pilot.flightEntries || [])
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 30)
        .map((f: any) => ({
            date: f.date,
            departure: f.departure,
            arrival: f.arrival,
            duration: f.totalTime,
            remarks: f.remarks,
            conditions: f.isInstrument ? 'IFR' : 'VFR', // heuristic
            night: f.night > 0
        }));

    const uniqueAirports = Array.from(new Set([
        ...recentFlights.map((f: any) => f.departure),
        ...recentFlights.map((f: any) => f.arrival)
    ])).filter(Boolean).join(', ');

    const systemInstruction = `You are a Chief Flight Instructor conducting a comprehensive safety review.
Analyze the pilot's logbook data to identify ANY potential risk factors. Do not limit yourself to specific categories if others are more relevant.

Common risk areas to consider (but do not feel limited to):
1. Seasonality: Winter operations, summer density altitude, etc.
2. Region/Terrain: Mountainous, complex airspace, coastal, flatland, etc.
3. Proficiency: Currency, frequency, variety of aircraft.
4. Logbook Integrity: Suspicious entries, lack of instructor endorsements for student pilots, "padding" hours.
5. Progression: Stagnation, rushing ratings, or gaps in training.

Output a VALID JSON object with this exact structure:
{
  "risk_factors": [
    {
      "category": "string (e.g. 'Seasonality', 'Logbook Integrity')",
      "riskLevel": "high" | "medium" | "low",
      "message": "concise description of the risk"
    }
  ],
  "overall_assessment": {
    "score": number (1-10, where 10 is highest risk),
    "summary": "concise overall summary"
  }
}
Do not include markdown formatting like \`\`\`json. Just the raw JSON string.`;

    const userPrompt = `
Pilot: ${pilot.name}
Total Time: ${pilot.experience.totalHours} hrs
Certificates: ${JSON.stringify(pilot.certificates)}

Recent Activity (Last 30 flights):
${JSON.stringify(recentFlights, null, 2)}

Operating Airports: ${uniqueAirports}
`;

    try {
        if (!isOpenRouterConfigured()) {
            throw new Error("Missing OPENROUTER_API_KEY");
        }

        const response = await generateCompletion({
            model: OPENROUTER_MODELS.PRO,
            systemPrompt: systemInstruction,
            userPrompt: userPrompt,
        });

        try {
            return parseJsonResponse(response);
        } catch (e) {
            console.error("AI returned invalid JSON:", response);
            return {
                risk_factors: [{ category: "System", risk_level: "low", description: "Raw analysis: " + response }],
                overall_assessment: { score: 0, summary: "Could not parse structured analysis." }
            };
        }

    } catch (error) {
        console.error("AI Analysis Error:", error);
        throw new Error("Failed to generate AI safety analysis");
    }
}

/**
 * Analyze aircraft maintenance logs and generate safety findings
 * Uses AI for structured JSON output
 */
export async function analyzeAircraftSafety(aircraft: AircraftData) {
    const systemInstruction = `You are an A&P Mechanic and Aviation Safety Inspector conducting a comprehensive maintenance review.
Analyze the aircraft's maintenance history to identify potential safety concerns, overdue inspections, and component risks.

Consider:
1. Time-since-overhaul on critical components (engine, prop, magnetos, vacuum pump, alternator)
2. AD (Airworthiness Directive) compliance patterns
3. Inspection currency (annual, 100-hour, transponder, pitot-static)
4. Repetitive squawks or recurring issues
5. Missing or incomplete maintenance entries
6. Component life limits and recommended service intervals

Output a VALID JSON object with this exact structure:
{
  "findings": [
    {
      "component": "string (e.g. 'Engine', 'Magnetos', 'Vacuum Pump')",
      "status": "ok" | "warning" | "critical",
      "message": "concise description of the finding",
      "lastMentioned": "ISO date string if found in logs, null otherwise"
    }
  ],
  "overall_score": number (1-10, where 10 is best/safest condition),
  "summary": "concise overall maintenance assessment"
}
Do not include markdown formatting. Just the raw JSON string.`;

    const recentLogs = (aircraft.logs || [])
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 50)
        .map((l: any) => ({
            date: l.date,
            description: l.description,
            hobbs: l.hobbsTime,
            tach: l.tachTime,
            mechanic: l.mechanic
        }));

    const userPrompt = `
Aircraft: ${aircraft.tailNumber} (${aircraft.year} ${aircraft.manufacturer} ${aircraft.model})
Current Hobbs: ${aircraft.currentHours.hobbs} hrs
Current Tach: ${aircraft.currentHours.tach} hrs

Maintenance Dates:
- Annual: ${aircraft.maintenanceDates?.annual || 'Unknown'}
- Transponder: ${aircraft.maintenanceDates?.transponder || 'Unknown'}
- Static System: ${aircraft.maintenanceDates?.staticSystem || 'Unknown'}
- 100-Hour: ${aircraft.maintenanceDates?.hundredHour || 'N/A'}

Recent Maintenance Log Entries (last 50):
${JSON.stringify(recentLogs, null, 2)}

Analyze this maintenance history and identify any safety concerns.`;

    try {
        if (!isOpenRouterConfigured()) {
            throw new Error("Missing OPENROUTER_API_KEY");
        }

        const response = await generateCompletion({
            model: OPENROUTER_MODELS.PRO,
            systemPrompt: systemInstruction,
            userPrompt: userPrompt,
        });

        try {
            const parsed = parseJsonResponse(response);
            return {
                findings: parsed.findings || [],
                score: parsed.overall_score || 5,
                summary: parsed.summary || 'Analysis complete.'
            };
        } catch (e) {
            console.error("AI returned invalid JSON:", response);
            return {
                findings: [{ component: "System", status: "warning", message: "Could not parse AI analysis" }],
                score: 5,
                summary: "Raw analysis: " + response.substring(0, 200)
            };
        }

    } catch (error) {
        console.error("Aircraft AI Analysis Error:", error);
        throw new Error("Failed to generate aircraft safety analysis");
    }
}

/**
 * Generate a complete pilot profile from logbook data using AI
 * Analyzes flight entries to infer missing profile information like certifications,
 * ratings, endorsements, and provides experience analysis
 */
export async function generatePilotProfile(
    flightEntries: LogbookEntry[],
    partialData?: {
        name?: string;
        email?: string;
    }
): Promise<GeneratedPilotProfile> {
    // Calculate raw experience totals from logbook entries
    const calculatedExperience = {
        totalHours: 0,
        picHours: 0,
        nightHours: 0,
        ifrHours: 0,
        crossCountryHours: 0,
        last90DaysHours: 0,
        last30DaysHours: 0,
        selHours: 0,
        melHours: 0,
        dualReceivedHours: 0,
        dualGivenHours: 0,
        soloHours: 0,
    };

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Sort entries by date
    const sortedEntries = [...flightEntries].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Calculate totals
    for (const entry of flightEntries) {
        calculatedExperience.totalHours += entry.totalTime || 0;
        calculatedExperience.picHours += entry.pic || 0;
        calculatedExperience.nightHours += entry.night || 0;
        calculatedExperience.ifrHours += (entry.actualInstrument || 0) + (entry.simulatedInstrument || 0);
        calculatedExperience.crossCountryHours += entry.crossCountry || 0;
        calculatedExperience.selHours += entry.sel || 0;
        calculatedExperience.melHours += entry.mel || 0;
        calculatedExperience.dualReceivedHours += entry.dualReceived || 0;
        calculatedExperience.dualGivenHours += entry.dualGiven || 0;
        calculatedExperience.soloHours += entry.solo || 0;

        const entryDate = new Date(entry.date);
        if (entryDate >= ninetyDaysAgo) {
            calculatedExperience.last90DaysHours += entry.totalTime || 0;
        }
        if (entryDate >= thirtyDaysAgo) {
            calculatedExperience.last30DaysHours += entry.totalTime || 0;
        }
    }

    // Get unique aircraft types and airports
    const aircraftTypes = Array.from(new Set(flightEntries.map(e => e.aircraftType).filter(Boolean)));
    const aircraftIdents = Array.from(new Set(flightEntries.map(e => e.aircraftIdent).filter(Boolean)));
    const airports = Array.from(new Set([
        ...flightEntries.map(e => e.from),
        ...flightEntries.map(e => e.to)
    ].filter(Boolean)));

    // Extract remarks for analysis
    const remarksWithDates = flightEntries
        .filter(e => e.remarks && e.remarks.trim().length > 0)
        .map(e => ({ date: e.date, remarks: e.remarks }))
        .slice(-50); // Last 50 remarks

    // Get first and last flight dates
    const firstFlight = sortedEntries[0]?.date || 'Unknown';
    const lastFlight = sortedEntries[sortedEntries.length - 1]?.date || 'Unknown';

    const systemInstruction = `You are an experienced Chief Flight Instructor and DPE (Designated Pilot Examiner) analyzing a pilot's logbook to build their complete profile.

Your task is to infer missing information about the pilot based on their flight history, experience patterns, and logbook remarks. Use your deep knowledge of FAA regulations, certificate requirements, and typical pilot progression.

ANALYSIS GUIDELINES:
1. **Certificate Type**: Infer from hours, PIC time, dual given (CFI indicator), ATP minimums
   - Student: < 40 hrs or all dual received
   - PPL: 40-250 hrs, has PIC time
   - CPL: 250+ hrs, significant PIC
   - ATP: 1500+ hrs or airline-pattern operations
   - Sport: If only light sport aircraft

2. **Instrument Rating**: Look for IFR hours, actual/simulated instrument time, IFR remarks

3. **Multi-Engine**: Check for MEL hours or multi-engine aircraft types

4. **Endorsements**: Infer from aircraft types and remarks
   - High Performance: 200+ HP aircraft (Bonanza, Cirrus SR22, etc.)
   - Complex: Retractable gear, constant speed prop
   - Tailwheel: Aircraft like Cubs, Citabrias, etc.
   - High Altitude: Pressurized aircraft, FL180+ operations

5. **Medical/Flight Review**: Estimate based on recency of flight activity
   - Medical: Active pilot likely has current medical (assume 1 year out)
   - Flight Review: If flying regularly, assume current (assume 2 years out)

6. **Profile Analysis**: Provide insights on their flying patterns, strengths, and areas for improvement

Output VALID JSON only (no markdown formatting):
{
  "inferredName": "string or null if cannot determine",
  "inferredEmail": "string or null (suggest format based on name)",
  "certificates": {
    "type": "Student" | "PPL" | "CPL" | "ATP" | "Sport",
    "instrumentRated": boolean,
    "multiEngineRated": boolean
  },
  "endorsements": [
    { "type": "High Performance" | "Complex" | "Tailwheel" | "High Altitude", "reasoning": "why inferred" }
  ],
  "medicalExpirationEstimate": "ISO date string (estimate 12 months from now if active)",
  "flightReviewExpirationEstimate": "ISO date string (estimate 24 months from now if active)",
  "profileAnalysis": {
    "pilotCategory": "string (e.g. 'Weekend Warrior', 'Career-Track', 'Flight Instructor', 'Active Private')",
    "strengthAreas": ["array of 2-4 strength areas"],
    "developmentAreas": ["array of 2-4 areas needing attention"],
    "recommendations": ["array of 2-4 specific recommendations"],
    "experienceSummary": "2-3 sentence summary of the pilot's experience and typical flying"
  },
  "confidence": {
    "certificateConfidence": "high" | "medium" | "low",
    "ratingsConfidence": "high" | "medium" | "low",
    "reasoning": "brief explanation of inference confidence"
  }
}`;

    const userPrompt = `
PILOT LOGBOOK DATA FOR ANALYSIS:

**Calculated Experience Totals:**
- Total Time: ${calculatedExperience.totalHours.toFixed(1)} hours
- PIC: ${calculatedExperience.picHours.toFixed(1)} hours
- Night: ${calculatedExperience.nightHours.toFixed(1)} hours
- Instrument (actual + sim): ${calculatedExperience.ifrHours.toFixed(1)} hours
- Cross-Country: ${calculatedExperience.crossCountryHours.toFixed(1)} hours
- SEL: ${calculatedExperience.selHours.toFixed(1)} hours
- MEL: ${calculatedExperience.melHours.toFixed(1)} hours
- Dual Received: ${calculatedExperience.dualReceivedHours.toFixed(1)} hours
- Dual Given: ${calculatedExperience.dualGivenHours.toFixed(1)} hours
- Solo: ${calculatedExperience.soloHours.toFixed(1)} hours
- Last 90 Days: ${calculatedExperience.last90DaysHours.toFixed(1)} hours
- Last 30 Days: ${calculatedExperience.last30DaysHours.toFixed(1)} hours

**Flight Activity Period:**
- First Flight: ${firstFlight}
- Most Recent Flight: ${lastFlight}
- Total Entries: ${flightEntries.length}

**Aircraft Flown:**
Types: ${aircraftTypes.join(', ') || 'Not specified'}
Tail Numbers: ${aircraftIdents.slice(0, 20).join(', ')}${aircraftIdents.length > 20 ? '...' : ''}

**Airports Visited:**
${airports.slice(0, 30).join(', ')}${airports.length > 30 ? ` (and ${airports.length - 30} more)` : ''}

**Logbook Remarks (recent):**
${remarksWithDates.length > 0 ? remarksWithDates.map(r => `[${r.date}] ${r.remarks}`).join('\n') : 'No remarks found'}

${partialData?.name ? `**Known Name:** ${partialData.name}` : ''}
${partialData?.email ? `**Known Email:** ${partialData.email}` : ''}

Based on this logbook data, generate the pilot's complete profile with inferred certifications, ratings, endorsements, and analysis.`;

    try {
        if (!isOpenRouterConfigured()) {
            throw new Error("Missing OPENROUTER_API_KEY");
        }

        const response = await generateCompletion({
            model: OPENROUTER_MODELS.PRO,
            systemPrompt: systemInstruction,
            userPrompt: userPrompt,
        });

        let aiInference: any;
        try {
            aiInference = parseJsonResponse(response);
        } catch (e) {
            console.error("AI returned invalid JSON:", response);
            // Provide sensible defaults if AI fails
            aiInference = {
                inferredName: null,
                inferredEmail: null,
                certificates: {
                    type: calculatedExperience.totalHours >= 250 ? 'CPL' : calculatedExperience.totalHours >= 40 ? 'PPL' : 'Student',
                    instrumentRated: calculatedExperience.ifrHours >= 40,
                    multiEngineRated: calculatedExperience.melHours >= 10
                },
                endorsements: [],
                medicalExpirationEstimate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                flightReviewExpirationEstimate: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString(),
                profileAnalysis: {
                    pilotCategory: 'Active Pilot',
                    strengthAreas: ['Consistent flight activity'],
                    developmentAreas: ['Continue building experience'],
                    recommendations: ['Maintain currency', 'Consider additional ratings'],
                    experienceSummary: `Pilot with ${calculatedExperience.totalHours.toFixed(1)} total hours and ${calculatedExperience.picHours.toFixed(1)} PIC hours.`
                }
            };
        }

        // Build the complete profile
        const profile: GeneratedPilotProfile = {
            name: partialData?.name || aiInference.inferredName || 'New Pilot',
            email: partialData?.email || aiInference.inferredEmail || `pilot${Date.now()}@example.com`,
            certificates: {
                type: aiInference.certificates?.type || 'PPL',
                instrumentRated: aiInference.certificates?.instrumentRated || false,
                multiEngineRated: aiInference.certificates?.multiEngineRated || false
            },
            endorsements: (aiInference.endorsements || []).map((e: any) => ({
                type: e.type,
                date: new Date().toISOString(),
                instructor: 'Inferred from logbook'
            })),
            experience: {
                totalHours: Math.round(calculatedExperience.totalHours * 10) / 10,
                picHours: Math.round(calculatedExperience.picHours * 10) / 10,
                nightHours: Math.round(calculatedExperience.nightHours * 10) / 10,
                ifrHours: Math.round(calculatedExperience.ifrHours * 10) / 10,
                crossCountryHours: Math.round(calculatedExperience.crossCountryHours * 10) / 10,
                last90DaysHours: Math.round(calculatedExperience.last90DaysHours * 10) / 10,
                last30DaysHours: Math.round(calculatedExperience.last30DaysHours * 10) / 10
            },
            medicalExpiration: aiInference.medicalExpirationEstimate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            flightReviewExpiration: aiInference.flightReviewExpirationEstimate || new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString(),
            flightEntries: flightEntries,
            profileAnalysis: aiInference.profileAnalysis || {
                pilotCategory: 'Active Pilot',
                strengthAreas: [],
                developmentAreas: [],
                recommendations: [],
                experienceSummary: 'Profile generated from logbook data.'
            }
        };

        return profile;

    } catch (error) {
        console.error("Profile Generation Error:", error);
        throw new Error("Failed to generate pilot profile from logbook");
    }
}
