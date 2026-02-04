/**
 * Skyris Flight Audit Service
 *
 * Uses AI to synthesize:
 * - Pilot Safety Analysis
 * - Aircraft Maintenance Audit (AV1ONICS)
 * - Weather Conditions (if provided)
 *
 * Outputs a combined flight audit with actionable recommendations
 */

import {
  isOpenRouterConfigured,
  generateCompletion,
  parseJsonResponse,
  OPENROUTER_MODELS,
} from './openRouterClient';
import { IPilot } from '@/lib/models/Pilot';
import { IAircraft } from '@/lib/models/Aircraft';
import SafetyAudit, { ISafetyAudit, IPilotSafetyAudit, IAircraftMaintenanceAudit } from '@/lib/models/SafetyAudit';
import { runAV1ONICSAudit, IAV1ONICSAudit, getAV1ONICSSummary } from './av1onicsService';
import { analyzePilotSafety, analyzeAircraftSafety } from './aiService';
import connectDB from '@/lib/db';

// Combined Flight Audit Result (as specified in requirements)
export interface ICombinedFlightAudit {
  airworthiness: boolean;
  pilot_currency_status: 'current' | 'expiring' | 'expired';
  combined_risk_factor: number; // 0-100, lower is safer
  mitigation_steps: string[];
  // Extended fields
  overall_recommendation: 'go' | 'caution' | 'no-go';
  reasoning: string;
  pilot_summary: string;
  aircraft_summary: string;
  risk_scenarios: {
    title: string;
    probability: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
  }[];
}

// Full Skyris Audit Result
export interface ISkyrisAuditResult {
  flightId?: string;
  pilotId: string;
  aircraftId: string;
  auditedAt: Date;

  // Component audits
  pilotAudit: IPilotSafetyAudit;
  aircraftAudit: IAircraftMaintenanceAudit;
  av1onicsAudit: IAV1ONICSAudit;

  // Gemini synthesized result
  combinedAudit: ICombinedFlightAudit;

  // Raw AI response for debugging
  aiModel: string;
  aiConfidence: number;
}

/**
 * Build pilot safety audit from pilot data
 */
async function buildPilotAudit(pilot: IPilot): Promise<IPilotSafetyAudit> {
  const now = new Date();

  // Calculate currency status
  let currencyStatus: 'current' | 'expiring' | 'expired' = 'current';
  const medicalDaysRemaining = Math.floor((new Date(pilot.medicalExpiration).getTime() - now.getTime()) / 86400000);
  const bfrDaysRemaining = Math.floor((new Date(pilot.flightReviewExpiration).getTime() - now.getTime()) / 86400000);

  if (medicalDaysRemaining < 0 || bfrDaysRemaining < 0) {
    currencyStatus = 'expired';
  } else if (medicalDaysRemaining <= 30 || bfrDaysRemaining <= 30) {
    currencyStatus = 'expiring';
  }

  // Determine experience level
  const totalHours = pilot.experience?.totalHours || 0;
  let experienceLevel: 'student' | 'low_time' | 'experienced' | 'professional' = 'low_time';
  if (pilot.certificates?.type === 'Student') {
    experienceLevel = 'student';
  } else if (totalHours < 100) {
    experienceLevel = 'low_time';
  } else if (totalHours < 500) {
    experienceLevel = 'experienced';
  } else {
    experienceLevel = 'professional';
  }

  // Run AI analysis if available
  let aiAnalysis;
  let findings: any[] = [];
  let overallScore = 80; // Default score

  try {
    const aiResult = await analyzePilotSafety({
      name: pilot.name,
      experience: pilot.experience,
      certificates: pilot.certificates,
      flightEntries: pilot.flightEntries || [],
    });

    if (aiResult?.risk_factors) {
      findings = aiResult.risk_factors.map((rf: any) => ({
        category: rf.category,
        riskLevel: rf.riskLevel || rf.risk_level || 'medium',
        message: rf.message || rf.description,
        recommendation: rf.recommendation,
      }));
    }

    if (aiResult?.overall_assessment?.score) {
      // Convert AI score (1-10 risk) to safety score (1-100 safe)
      overallScore = Math.round(100 - (aiResult.overall_assessment.score * 10));
    }

    aiAnalysis = {
      model: OPENROUTER_MODELS.PRO,
      prompt: 'Pilot safety analysis',
      confidence: 0.85,
    };
  } catch (error) {
    console.warn('AI pilot analysis failed:', error);
  }

  // Determine risk level from score
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (overallScore < 40) riskLevel = 'critical';
  else if (overallScore < 60) riskLevel = 'high';
  else if (overallScore < 80) riskLevel = 'medium';

  return {
    pilotId: pilot._id,
    analyzedAt: now,
    overallScore,
    riskLevel,
    currencyStatus,
    experienceLevel,
    findings,
    qualifications: {
      certificateType: pilot.certificates?.type || 'PPL',
      instrumentRated: pilot.certificates?.instrumentRated || false,
      multiEngineRated: pilot.certificates?.multiEngineRated || false,
      endorsements: pilot.endorsements?.map(e => e.type) || [],
    },
    recency: {
      totalHours: pilot.experience?.totalHours || 0,
      last30DaysHours: pilot.experience?.last30DaysHours || 0,
      last90DaysHours: pilot.experience?.last90DaysHours || 0,
      nightHours: pilot.experience?.nightHours || 0,
      ifrHours: pilot.experience?.ifrHours || 0,
    },
    expirations: {
      medical: pilot.medicalExpiration,
      flightReview: pilot.flightReviewExpiration,
    },
    aiAnalysis,
  };
}

/**
 * Build aircraft maintenance audit from AV1ONICS audit
 */
async function buildAircraftAudit(aircraft: IAircraft, av1onicsAudit: IAV1ONICSAudit): Promise<IAircraftMaintenanceAudit> {
  const now = new Date();

  // Map AV1ONICS status to airworthiness
  let airworthinessStatus: 'airworthy' | 'conditional' | 'grounded' = 'airworthy';
  if (av1onicsAudit.overallStatus === 'grounded') {
    airworthinessStatus = 'grounded';
  } else if (av1onicsAudit.overallStatus === 'conditional') {
    airworthinessStatus = 'conditional';
  }

  // Map check results to inspection statuses
  const mapCheckToStatus = (check: any) => ({
    lastDate: check.lastCompleted,
    dueDate: check.dueDate,
    status: check.status as 'current' | 'due_soon' | 'overdue' | 'na',
  });

  // Run AI analysis if available
  let aiAnalysis;
  let findings: any[] = [];

  try {
    const aiResult = await analyzeAircraftSafety({
      tailNumber: aircraft.tailNumber,
      manufacturer: aircraft.manufacturer,
      model: aircraft.model,
      year: aircraft.year,
      currentHours: aircraft.currentHours,
      maintenanceDates: aircraft.maintenanceDates,
      logs: aircraft.logs,
    });

    if (aiResult?.findings) {
      findings = aiResult.findings.map((f: any) => ({
        component: f.component,
        status: f.status,
        message: f.message,
        lastInspectionDate: f.lastMentioned ? new Date(f.lastMentioned) : undefined,
      }));
    }

    aiAnalysis = {
      model: OPENROUTER_MODELS.PRO,
      prompt: 'Aircraft safety analysis',
      confidence: 0.85,
    };
  } catch (error) {
    console.warn('AI aircraft analysis failed:', error);
  }

  // Add findings from AV1ONICS critical issues
  av1onicsAudit.criticalIssues.forEach(issue => {
    findings.push({
      component: 'Airworthiness',
      status: 'critical',
      message: issue,
    });
  });

  av1onicsAudit.warnings.forEach(warning => {
    findings.push({
      component: 'Maintenance',
      status: 'warning',
      message: warning,
    });
  });

  return {
    aircraftId: aircraft._id,
    analyzedAt: now,
    overallScore: av1onicsAudit.overallScore,
    airworthinessStatus,
    findings,
    inspections: {
      annual: mapCheckToStatus(av1onicsAudit.checks.annual),
      vor: mapCheckToStatus(av1onicsAudit.checks.vor),
      hundredHour: mapCheckToStatus(av1onicsAudit.checks.hundredHour),
      altimeter: mapCheckToStatus(av1onicsAudit.checks.altimeter),
      transponder: mapCheckToStatus(av1onicsAudit.checks.transponder),
      elt: mapCheckToStatus(av1onicsAudit.checks.elt),
      staticSystem: mapCheckToStatus(av1onicsAudit.checks.staticSystem),
    } as IAircraftMaintenanceAudit['inspections'],
    melItems: av1onicsAudit.melCheck.inoperativeItems.map(item => ({
      item: item.item,
      required: item.required,
      status: 'inoperative' as const,
      remarks: item.remarks,
    })),
    requiresMEL: av1onicsAudit.melCheck.requiresMEL,
    melUploaded: av1onicsAudit.melCheck.melUploaded,
    aiAnalysis,
  };
}

/**
 * Use AI to synthesize pilot and aircraft audits into combined flight audit
 */
async function synthesizeWithGemini(
  pilotAudit: IPilotSafetyAudit,
  aircraftAudit: IAircraftMaintenanceAudit,
  av1onicsAudit: IAV1ONICSAudit,
  pilot: IPilot,
  aircraft: IAircraft
): Promise<ICombinedFlightAudit> {
  if (!isOpenRouterConfigured()) {
    // Return default analysis if no API key
    return buildDefaultCombinedAudit(pilotAudit, aircraftAudit, av1onicsAudit);
  }

  const systemPrompt = `You are an expert aviation safety analyst synthesizing pilot and aircraft data into a comprehensive flight safety audit.
Your role is to identify combined risk factors that may not be apparent when looking at pilot or aircraft data independently.

Consider interactions such as:
- Low-time pilot + high-performance aircraft
- Expired/expiring currency + challenging conditions
- Maintenance issues + operational demands
- Experience gaps + aircraft complexity

Output ONLY valid JSON with no markdown formatting.`;

  const userPrompt = `Analyze this flight pairing and provide a combined safety assessment.

PILOT PROFILE:
- Name: ${pilot.name}
- Certificate: ${pilotAudit.qualifications.certificateType}
- Instrument Rated: ${pilotAudit.qualifications.instrumentRated}
- Multi-Engine: ${pilotAudit.qualifications.multiEngineRated}
- Total Hours: ${pilotAudit.recency.totalHours}
- Last 90 Days: ${pilotAudit.recency.last90DaysHours} hours
- Currency Status: ${pilotAudit.currencyStatus}
- Medical Expires: ${pilotAudit.expirations.medical}
- Flight Review Expires: ${pilotAudit.expirations.flightReview}
- Safety Score: ${pilotAudit.overallScore}/100
- Risk Findings: ${JSON.stringify(pilotAudit.findings.slice(0, 5))}

AIRCRAFT STATUS:
- Tail: ${aircraft.tailNumber}
- Type: ${aircraft.year} ${aircraft.manufacturer} ${aircraft.model}
- Hobbs: ${aircraft.currentHours.hobbs} hours
- Airworthiness: ${aircraftAudit.airworthinessStatus}
- Safety Score: ${aircraftAudit.overallScore}/100
- AV1ONICS Summary: ${getAV1ONICSSummary(av1onicsAudit)}
- Critical Issues: ${av1onicsAudit.criticalIssues.join('; ') || 'None'}
- Warnings: ${av1onicsAudit.warnings.join('; ') || 'None'}
- MEL Required: ${aircraftAudit.requiresMEL}
- MEL Uploaded: ${aircraftAudit.melUploaded}
- Maintenance Findings: ${JSON.stringify(aircraftAudit.findings.slice(0, 5))}

Provide your analysis as JSON:
{
  "airworthiness": boolean (is aircraft legal to fly),
  "pilot_currency_status": "current" | "expiring" | "expired",
  "combined_risk_factor": number (0-100, where 0 is safest),
  "mitigation_steps": ["array of specific actionable recommendations"],
  "overall_recommendation": "go" | "caution" | "no-go",
  "reasoning": "2-3 sentence explanation of your recommendation",
  "pilot_summary": "1 sentence pilot assessment",
  "aircraft_summary": "1 sentence aircraft assessment",
  "risk_scenarios": [
    {
      "title": "scenario name",
      "probability": number (0-100),
      "severity": "low" | "medium" | "high" | "critical",
      "description": "brief description"
    }
  ]
}`;

  try {
    const response = await generateCompletion({
      model: OPENROUTER_MODELS.PRO,
      systemPrompt,
      userPrompt,
    });

    const parsed = parseJsonResponse(response);

    return {
      airworthiness: parsed.airworthiness ?? (aircraftAudit.airworthinessStatus !== 'grounded'),
      pilot_currency_status: parsed.pilot_currency_status || pilotAudit.currencyStatus,
      combined_risk_factor: parsed.combined_risk_factor ?? calculateDefaultRiskFactor(pilotAudit, aircraftAudit),
      mitigation_steps: parsed.mitigation_steps || [],
      overall_recommendation: parsed.overall_recommendation || determineDefaultRecommendation(pilotAudit, aircraftAudit),
      reasoning: parsed.reasoning || 'Analysis based on pilot currency and aircraft airworthiness.',
      pilot_summary: parsed.pilot_summary || `${pilotAudit.experienceLevel} pilot with ${pilotAudit.recency.totalHours} hours.`,
      aircraft_summary: parsed.aircraft_summary || `${aircraft.tailNumber} is ${aircraftAudit.airworthinessStatus}.`,
      risk_scenarios: parsed.risk_scenarios || [],
    };
  } catch (error) {
    console.error('AI synthesis failed:', error);
    return buildDefaultCombinedAudit(pilotAudit, aircraftAudit, av1onicsAudit);
  }
}

/**
 * Calculate default risk factor without AI
 */
function calculateDefaultRiskFactor(pilotAudit: IPilotSafetyAudit, aircraftAudit: IAircraftMaintenanceAudit): number {
  // Lower scores = safer, so we invert and combine
  const pilotRisk = 100 - pilotAudit.overallScore;
  const aircraftRisk = 100 - aircraftAudit.overallScore;

  // Combined risk is weighted average with interaction factor
  const baseRisk = (pilotRisk * 0.4) + (aircraftRisk * 0.4);

  // Interaction factor: if both are risky, it's worse than sum
  const interactionFactor = (pilotRisk / 100) * (aircraftRisk / 100) * 20;

  return Math.min(100, Math.round(baseRisk + interactionFactor));
}

/**
 * Determine default recommendation without AI
 */
function determineDefaultRecommendation(
  pilotAudit: IPilotSafetyAudit,
  aircraftAudit: IAircraftMaintenanceAudit
): 'go' | 'caution' | 'no-go' {
  if (aircraftAudit.airworthinessStatus === 'grounded') return 'no-go';
  if (pilotAudit.currencyStatus === 'expired') return 'no-go';

  if (aircraftAudit.airworthinessStatus === 'conditional') return 'caution';
  if (pilotAudit.currencyStatus === 'expiring') return 'caution';
  if (pilotAudit.overallScore < 60 || aircraftAudit.overallScore < 60) return 'caution';

  return 'go';
}

/**
 * Build default combined audit without AI
 */
function buildDefaultCombinedAudit(
  pilotAudit: IPilotSafetyAudit,
  aircraftAudit: IAircraftMaintenanceAudit,
  av1onicsAudit: IAV1ONICSAudit
): ICombinedFlightAudit {
  const recommendation = determineDefaultRecommendation(pilotAudit, aircraftAudit);
  const riskFactor = calculateDefaultRiskFactor(pilotAudit, aircraftAudit);

  const mitigationSteps: string[] = [];

  if (pilotAudit.currencyStatus === 'expiring') {
    mitigationSteps.push('Schedule medical/flight review renewal soon');
  }
  if (pilotAudit.recency.last90DaysHours < 5) {
    mitigationSteps.push('Consider a proficiency flight with an instructor');
  }
  if (aircraftAudit.airworthinessStatus === 'conditional') {
    mitigationSteps.push('Address upcoming maintenance items before next flight');
  }
  if (av1onicsAudit.melCheck.requiresMEL && !av1onicsAudit.melCheck.melUploaded) {
    mitigationSteps.push('Upload MEL for this aircraft type');
  }

  av1onicsAudit.recommendations.forEach(rec => mitigationSteps.push(rec));

  return {
    airworthiness: aircraftAudit.airworthinessStatus !== 'grounded',
    pilot_currency_status: pilotAudit.currencyStatus,
    combined_risk_factor: riskFactor,
    mitigation_steps: mitigationSteps,
    overall_recommendation: recommendation,
    reasoning: `Pilot is ${pilotAudit.currencyStatus} and aircraft is ${aircraftAudit.airworthinessStatus}. Combined risk factor: ${riskFactor}/100.`,
    pilot_summary: `${pilotAudit.experienceLevel} pilot with ${pilotAudit.recency.totalHours} total hours.`,
    aircraft_summary: `Aircraft ${av1onicsAudit.overallStatus} with score ${aircraftAudit.overallScore}/100.`,
    risk_scenarios: [],
  };
}

/**
 * Run complete Skyris Flight Audit
 */
export async function runSkyrisAudit(
  pilot: IPilot,
  aircraft: IAircraft,
  options: {
    flightId?: string;
    isIFRFlight?: boolean;
    isForHire?: boolean;
    saveToDb?: boolean;
  } = {}
): Promise<ISkyrisAuditResult> {
  const { flightId, isIFRFlight = false, isForHire = false, saveToDb = true } = options;

  // Run AV1ONICS audit
  const av1onicsAudit = runAV1ONICSAudit(aircraft, { isIFRFlight, isForHire });

  // Build pilot audit
  const pilotAudit = await buildPilotAudit(pilot);

  // Build aircraft audit from AV1ONICS
  const aircraftAudit = await buildAircraftAudit(aircraft, av1onicsAudit);

  // Synthesize with Gemini
  const combinedAudit = await synthesizeWithGemini(
    pilotAudit,
    aircraftAudit,
    av1onicsAudit,
    pilot,
    aircraft
  );

  const result: ISkyrisAuditResult = {
    flightId,
    pilotId: pilot._id.toString(),
    aircraftId: aircraft._id.toString(),
    auditedAt: new Date(),
    pilotAudit,
    aircraftAudit,
    av1onicsAudit,
    combinedAudit,
    aiModel: OPENROUTER_MODELS.PRO,
    aiConfidence: 0.85,
  };

  // Save to database if requested
  if (saveToDb) {
    try {
      await connectDB();

      const safetyAudit = new SafetyAudit({
        flightId: flightId ? flightId : undefined,
        pilotAudit,
        aircraftAudit,
        combinedAnalysis: {
          airworthiness: combinedAudit.airworthiness,
          pilotCurrencyStatus: combinedAudit.pilot_currency_status,
          combinedRiskFactor: combinedAudit.combined_risk_factor,
          overallRecommendation: combinedAudit.overall_recommendation,
          reasoning: combinedAudit.reasoning,
          mitigationSteps: combinedAudit.mitigation_steps,
          riskScenarios: combinedAudit.risk_scenarios.map(s => ({
            title: s.title,
            probability: s.probability,
            severity: s.severity,
            description: s.description,
            mitigations: [],
            affectedSystems: [],
          })),
        },
        status: 'completed',
        generatedBy: 'ai',
        aiModel: OPENROUTER_MODELS.PRO,
      });

      await safetyAudit.save();
    } catch (error) {
      console.error('Failed to save safety audit:', error);
    }
  }

  return result;
}

/**
 * Get latest Skyris audit for a pilot/aircraft pair
 */
export async function getLatestSkyrisAudit(
  pilotId: string,
  aircraftId: string
): Promise<ISafetyAudit | null> {
  await connectDB();

  return SafetyAudit.findOne({
    'pilotAudit.pilotId': pilotId,
    'aircraftAudit.aircraftId': aircraftId,
    status: 'completed',
  })
    .sort({ createdAt: -1 })
    .exec();
}

export default {
  runSkyrisAudit,
  getLatestSkyrisAudit,
};
