// AI-Powered Flight Safety Analysis Service
// Uses Google Gemini for intelligent safety reasoning and recommendations

import { GoogleGenerativeAI } from '@google/generative-ai';
import { IFlight, IComprehensiveSafetyAnalysis } from '../models/Flight';
import { IAircraft } from '../models/Aircraft';
import { IPilot } from '../models/Pilot';

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

export interface IAISafetyAnalysis {
  summary: string;
  riskAssessment: string;
  keyRisks: Array<{
    risk: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    explanation: string;
  }>;
  recommendations: Array<{
    action: string;
    priority: 'immediate' | 'before_flight' | 'consider';
    rationale: string;
  }>;
  goNoGoReasoning: string;
  finalVerdict: 'GO' | 'CAUTION' | 'NO-GO';
  confidenceLevel: number;
}

export async function generateAISafetyAnalysis(
  flight: IFlight,
  pilot: IPilot,
  aircraft: IAircraft,
  existingAnalysis: IComprehensiveSafetyAnalysis
): Promise<IAISafetyAnalysis | null> {
  if (!genAI) {
    console.warn('Gemini API key not configured - AI analysis unavailable');
    return null;
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    // Build context for AI
    const flightContext = buildFlightContext(flight, pilot, aircraft, existingAnalysis);

    const prompt = `You are an expert aviation safety analyst. Analyze this flight and provide a comprehensive safety assessment.

${flightContext}

Based on this data, provide a JSON response with the following structure (respond ONLY with valid JSON, no markdown):
{
  "summary": "2-3 sentence executive summary of the flight safety status",
  "riskAssessment": "Detailed paragraph explaining the overall risk profile considering all factors",
  "keyRisks": [
    {
      "risk": "Name of the risk",
      "severity": "low|medium|high|critical",
      "explanation": "Why this is a risk and what could happen"
    }
  ],
  "recommendations": [
    {
      "action": "Specific actionable recommendation",
      "priority": "immediate|before_flight|consider",
      "rationale": "Why this action is important"
    }
  ],
  "goNoGoReasoning": "Detailed reasoning for the go/no-go decision, written like an experienced CFI would explain to a student",
  "finalVerdict": "GO|CAUTION|NO-GO",
  "confidenceLevel": 85
}

Focus on:
1. Pilot qualifications vs actual weather conditions
2. Aircraft maintenance status and any mechanical concerns
3. Pilot familiarity with the aircraft and route
4. Weather trends and forecast conditions at both departure and destination
5. Combined risk factors that compound each other
6. Specific, actionable recommendations

Be direct and specific. Prioritize safety but don't be overly conservative without reason.`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('AI response did not contain valid JSON');
      return null;
    }

    const aiAnalysis: IAISafetyAnalysis = JSON.parse(jsonMatch[0]);
    return aiAnalysis;

  } catch (error) {
    console.error('AI Safety Analysis error:', error);
    return null;
  }
}

function buildFlightContext(
  flight: IFlight,
  pilot: IPilot,
  aircraft: IAircraft,
  analysis: IComprehensiveSafetyAnalysis
): string {
  const depWeather = analysis.weatherAnalysis?.departureConditions;
  const arrWeather = analysis.weatherAnalysis?.arrivalConditions;
  const familiarity = analysis.familiarityAnalysis;
  const survivalScore = analysis.survivalScoreBreakdown;

  return `
=== FLIGHT DETAILS ===
Departure: ${flight.departureAirport}
Destination: ${flight.arrivalAirport || 'Local flight'}
Scheduled: ${new Date(flight.scheduledDate).toLocaleDateString()} ${flight.scheduledTime || ''}
Duration: ${flight.estimatedDuration ? `${flight.estimatedDuration} hours` : 'Unknown'}

=== PILOT INFORMATION ===
Name: ${pilot.name}
Certificate: ${pilot.certificates?.type || 'Unknown'}
Instrument Rated: ${pilot.certificates?.instrumentRated ? 'Yes' : 'No'}
Total Hours: ${pilot.experience?.totalHours || 0}
PIC Hours: ${pilot.experience?.picHours || 0}
Night Hours: ${pilot.experience?.nightHours || 0}
IFR Hours: ${pilot.experience?.ifrHours || 0}
Last 90 Days: ${pilot.experience?.last90DaysHours || 0} hours
Medical Expires: ${new Date(pilot.medicalExpiration).toLocaleDateString()}
Flight Review Expires: ${new Date(pilot.flightReviewExpiration).toLocaleDateString()}
Currency Status: ${analysis.pilotAnalysis?.currencyStatus}
Experience Level: ${analysis.pilotAnalysis?.experienceLevel}
Pilot Risk Factors: ${analysis.pilotAnalysis?.riskFactors?.join(', ') || 'None identified'}

=== AIRCRAFT INFORMATION ===
Tail Number: ${aircraft.tailNumber}
Type: ${aircraft.year} ${aircraft.manufacturer} ${aircraft.model}
Hobbs: ${aircraft.currentHours?.hobbs || 0} hours
Tach: ${aircraft.currentHours?.tach || 0} hours
Annual Due: ${aircraft.maintenanceDates?.annual ? new Date(aircraft.maintenanceDates.annual).toLocaleDateString() : 'Unknown'}
Transponder Due: ${aircraft.maintenanceDates?.transponder ? new Date(aircraft.maintenanceDates.transponder).toLocaleDateString() : 'Unknown'}
Maintenance Status: ${analysis.aircraftAnalysis?.maintenanceStatus}
Mechanical Risks: ${analysis.aircraftAnalysis?.mechanicalRisks?.join(', ') || 'None identified'}

=== DEPARTURE WEATHER (${flight.departureAirport}) ===
${depWeather ? `
Flight Category: ${depWeather.flightCategory}
METAR: ${depWeather.metar}
Visibility: ${depWeather.visibility} SM
Ceiling: ${depWeather.ceiling || 'Clear'} ft
Wind: ${depWeather.wind?.direction}° at ${depWeather.wind?.speed} kts${depWeather.wind?.gust ? ` gusting ${depWeather.wind.gust}` : ''}
Temperature: ${depWeather.temperature !== undefined ? `${depWeather.temperature}°C` : 'N/A'}
Density Altitude: ${depWeather.densityAltitude || 'N/A'} ft
Trend: ${depWeather.trend || 'stable'}
TAF: ${depWeather.taf || 'Not available'}
` : 'Weather data not available'}

=== DESTINATION WEATHER (${flight.arrivalAirport || 'N/A'}) ===
${arrWeather ? `
Flight Category: ${arrWeather.flightCategory}
METAR: ${arrWeather.metar}
Visibility: ${arrWeather.visibility} SM
Ceiling: ${arrWeather.ceiling || 'Clear'} ft
Wind: ${arrWeather.wind?.direction}° at ${arrWeather.wind?.speed} kts${arrWeather.wind?.gust ? ` gusting ${arrWeather.wind.gust}` : ''}
Trend: ${arrWeather.trend || 'stable'}
TAF: ${arrWeather.taf || 'Not available'}
` : 'N/A - Local flight or weather not available'}

=== PILOT FAMILIARITY ===
${familiarity ? `
Aircraft Familiarity: ${familiarity.aircraftFamiliarity?.familiarityLevel || 'Unknown'}
- Flights in this tail: ${familiarity.aircraftFamiliarity?.tailNumberFlights || 0}
- Hours in type: ${familiarity.aircraftFamiliarity?.hoursInType?.toFixed(1) || 0}
Route Familiarity: ${familiarity.routeFamiliarity?.familiarityLevel || 'Unknown'}
- Departure visits: ${familiarity.routeFamiliarity?.departureVisits || 0}
- Arrival visits: ${familiarity.routeFamiliarity?.arrivalVisits || 0}
Familiarity Concerns: ${familiarity.riskFactors?.join(', ') || 'None'}
` : 'Familiarity data not available'}

=== SURVIVAL SCORE BREAKDOWN (/100) ===
${survivalScore ? `
Aircraft Score: ${survivalScore.aircraftScore}/25
Pilot Score: ${survivalScore.pilotScore}/25
Weather Score: ${survivalScore.weatherScore}/20
Familiarity Score: ${survivalScore.familiarityScore}/15
Failure Risk Score: ${survivalScore.failureProbScore}/15
TOTAL: ${survivalScore.totalScore}/100 (${survivalScore.survivalProbability})
` : 'Score not calculated'}

=== IDENTIFIED RISK SCENARIOS ===
${analysis.combinedRiskScenarios?.map(s =>
  `- ${s.title} (${s.severity}, ${s.probability}% probability): ${s.description}`
).join('\n') || 'None identified'}

=== LEGALITY CHECKS ===
${flight.legalityChecks?.map(c =>
  `- [${c.status.toUpperCase()}] ${c.item}: ${c.message}`
).join('\n') || 'No checks performed'}

=== CURRENT SYSTEM RECOMMENDATION ===
Status: ${analysis.goNoGoRecommendation?.toUpperCase()}
Reasoning: ${analysis.reasoning}
`;
}

// Send AI-enhanced safety email
export async function sendAISafetyEmail(
  flight: IFlight,
  aiAnalysis: IAISafetyAnalysis,
  recipientEmail: string
): Promise<{ success: boolean; message: string }> {
  const { Resend } = await import('resend');
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

  if (!resend) {
    return { success: false, message: 'Email service not configured' };
  }

  const pilot = flight.pilot as any;
  const aircraft = flight.aircraft as any;

  const statusColor = aiAnalysis.finalVerdict === 'NO-GO' ? '#dc2626'
    : aiAnalysis.finalVerdict === 'CAUTION' ? '#d97706'
    : '#059669';

  const statusEmoji = aiAnalysis.finalVerdict === 'NO-GO' ? '🚨'
    : aiAnalysis.finalVerdict === 'CAUTION' ? '⚠️'
    : '✅';

  const risksHTML = aiAnalysis.keyRisks.map(risk => `
    <div style="background: ${
      risk.severity === 'critical' ? '#fef2f2' :
      risk.severity === 'high' ? '#fff7ed' :
      risk.severity === 'medium' ? '#fffbeb' : '#f0fdf4'
    }; border-left: 4px solid ${
      risk.severity === 'critical' ? '#dc2626' :
      risk.severity === 'high' ? '#ea580c' :
      risk.severity === 'medium' ? '#d97706' : '#059669'
    }; padding: 12px 16px; margin: 8px 0; border-radius: 0 8px 8px 0;">
      <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">
        ${risk.risk}
        <span style="background: ${
          risk.severity === 'critical' ? '#dc2626' :
          risk.severity === 'high' ? '#ea580c' :
          risk.severity === 'medium' ? '#d97706' : '#059669'
        }; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin-left: 8px; text-transform: uppercase;">
          ${risk.severity}
        </span>
      </div>
      <div style="color: #4b5563; font-size: 14px;">${risk.explanation}</div>
    </div>
  `).join('');

  const actionsHTML = aiAnalysis.recommendations.map(rec => `
    <div style="display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
      <div style="flex-shrink: 0;">
        <span style="display: inline-block; background: ${
          rec.priority === 'immediate' ? '#dc2626' :
          rec.priority === 'before_flight' ? '#d97706' : '#3b82f6'
        }; color: white; padding: 4px 10px; border-radius: 16px; font-size: 11px; text-transform: uppercase; font-weight: 600;">
          ${rec.priority.replace('_', ' ')}
        </span>
      </div>
      <div>
        <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">${rec.action}</div>
        <div style="color: #6b7280; font-size: 13px;">${rec.rationale}</div>
      </div>
    </div>
  `).join('');

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Flight Safety Analysis</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background: #f8fafc;">
  <div style="max-width: 640px; margin: 0 auto; padding: 20px;">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, ${statusColor} 0%, ${statusColor}cc 100%); color: white; padding: 32px 24px; border-radius: 16px 16px 0 0; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 12px;">${statusEmoji}</div>
      <h1 style="margin: 0; font-size: 28px; font-weight: 700;">${aiAnalysis.finalVerdict}</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 16px;">AI Safety Analysis Complete</p>
      <p style="margin: 4px 0 0 0; opacity: 0.7; font-size: 14px;">Confidence: ${aiAnalysis.confidenceLevel}%</p>
    </div>

    <!-- Main Content -->
    <div style="background: white; padding: 24px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">

      <!-- Flight Info -->
      <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
        <table style="width: 100%;">
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Pilot:</td>
            <td style="padding: 4px 0; font-weight: 500; text-align: right;">${pilot?.name || 'Unknown'}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Aircraft:</td>
            <td style="padding: 4px 0; font-weight: 500; text-align: right;">${aircraft?.tailNumber} (${aircraft?.model})</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Route:</td>
            <td style="padding: 4px 0; font-weight: 500; text-align: right;">${flight.departureAirport} → ${flight.arrivalAirport || 'Local'}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Date:</td>
            <td style="padding: 4px 0; font-weight: 500; text-align: right;">${new Date(flight.scheduledDate).toLocaleDateString()}</td>
          </tr>
        </table>
      </div>

      <!-- AI Summary -->
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #1f2937; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">🤖</span> AI Analysis Summary
        </h2>
        <p style="margin: 0; color: #374151; line-height: 1.6; background: #f0f9ff; padding: 16px; border-radius: 8px; border-left: 4px solid #0ea5e9;">
          ${aiAnalysis.summary}
        </p>
      </div>

      <!-- Risk Assessment -->
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #1f2937;">📊 Risk Assessment</h2>
        <p style="margin: 0; color: #4b5563; line-height: 1.6;">
          ${aiAnalysis.riskAssessment}
        </p>
      </div>

      <!-- Key Risks -->
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #dc2626;">⚠️ Key Risks Identified</h2>
        ${risksHTML || '<p style="color: #6b7280;">No significant risks identified.</p>'}
      </div>

      <!-- Recommendations -->
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #059669;">✅ Recommended Actions</h2>
        <div style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          ${actionsHTML || '<p style="padding: 16px; color: #6b7280;">No specific actions recommended.</p>'}
        </div>
      </div>

      <!-- Go/No-Go Reasoning -->
      <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #1f2937;">🎯 Decision Reasoning</h2>
        <p style="margin: 0; color: #374151; line-height: 1.7; font-size: 15px;">
          ${aiAnalysis.goNoGoReasoning}
        </p>
      </div>

      <!-- Final Verdict -->
      <div style="background: ${statusColor}15; border: 2px solid ${statusColor}; border-radius: 12px; padding: 20px; text-align: center;">
        <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Final Recommendation</p>
        <p style="margin: 0; color: ${statusColor}; font-size: 32px; font-weight: 700;">${aiAnalysis.finalVerdict}</p>
      </div>

    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
      <p style="margin: 0 0 4px 0;">Generated by Aviation Intelligence AI Safety Analyst</p>
      <p style="margin: 0;">Always verify information and use your own judgment. AI analysis is advisory only.</p>
    </div>

  </div>
</body>
</html>
  `.trim();

  try {
    const { data, error } = await resend.emails.send({
      from: 'Aviation Intelligence <onboarding@resend.dev>',
      to: [recipientEmail],
      subject: `${statusEmoji} AI Safety Analysis: ${aircraft?.tailNumber} - ${aiAnalysis.finalVerdict}`,
      html: htmlBody,
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, message: `AI analysis email sent to ${recipientEmail}` };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}
