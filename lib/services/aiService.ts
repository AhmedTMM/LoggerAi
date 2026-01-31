import { GoogleGenerativeAI } from '@google/generative-ai';

// Gemini Pro 3 Preview - Latest model for all safety analysis
const GEMINI_MODEL = 'gemini-3-pro-preview';

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
        if (!process.env.GEMINI_API_KEY) {
            // Development/Build safe fallback checks
            throw new Error("Missing GEMINI_API_KEY");
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-3-pro-preview",
            systemInstruction: systemInstruction
        });

        const result = await model.generateContent(userPrompt);
        const response = await result.response;
        const text = response.text();

        // Cleanup potential markdown formatting if model ignores instruction
        const jsonString = text.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.error("AI returned invalid JSON:", text);
            return {
                risk_factors: [{ category: "System", risk_level: "low", description: "Raw analysis: " + text }],
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
 * Uses Gemini Pro 3 Preview for structured JSON output
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
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("Missing GEMINI_API_KEY");
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: GEMINI_MODEL,
            systemInstruction: systemInstruction
        });

        const result = await model.generateContent(userPrompt);
        const response = await result.response;
        const text = response.text();

        const jsonString = text.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            const parsed = JSON.parse(jsonString);
            return {
                findings: parsed.findings || [],
                score: parsed.overall_score || 5,
                summary: parsed.summary || 'Analysis complete.'
            };
        } catch (e) {
            console.error("AI returned invalid JSON:", text);
            return {
                findings: [{ component: "System", status: "warning", message: "Could not parse AI analysis" }],
                score: 5,
                summary: "Raw analysis: " + text.substring(0, 200)
            };
        }

    } catch (error) {
        console.error("Aircraft AI Analysis Error:", error);
        throw new Error("Failed to generate aircraft safety analysis");
    }
}
