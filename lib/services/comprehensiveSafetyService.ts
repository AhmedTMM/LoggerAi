// Comprehensive Flight Safety Analysis Service
// Combines weather data, pilot capabilities, and aircraft performance for thorough safety assessment

import Flight, { IFlight, ILegalityCheck, IComprehensiveSafetyAnalysis, IWeatherData } from '@/lib/models/Flight';
import { IAircraft } from '@/lib/models/Aircraft';
import { IPilot } from '@/lib/models/Pilot';
import {
  fetchRouteWeather,
  fetchEnhancedWeatherData,
  analyzeWeatherVsAircraft,
  analyzeWeatherVsPilot,
  IEnhancedWeatherData,
} from './weatherService';
import { sendPreFlightAgenticAlert } from './emailService';
import mongoose from 'mongoose';

// Risk scenario interface
interface IRiskScenario {
  title: string;
  probability: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  mitigations?: string[];
}

// Familiarity analysis interface
interface IFamiliarityAnalysis {
  aircraftFamiliarity: {
    tailNumberFlights: number;
    typeFlights: number;
    hoursInType: number;
    lastFlownDate?: Date;
    familiarityLevel: 'unfamiliar' | 'low' | 'moderate' | 'high';
  };
  routeFamiliarity: {
    departureVisits: number;
    arrivalVisits: number;
    routeFlown: boolean;
    familiarityLevel: 'unfamiliar' | 'low' | 'moderate' | 'high';
  };
  overallFamiliarityScore: number; // 0-100
  riskFactors: string[];
}

// Survival score breakdown
interface ISurvivalScoreBreakdown {
  aircraftScore: number;      // /25
  pilotScore: number;         // /25
  weatherScore: number;       // /20
  familiarityScore: number;   // /15
  failureProbScore: number;   // /15
  totalScore: number;         // /100
  survivalProbability: string;
}

// Main comprehensive safety analysis function
export async function runComprehensiveSafetyAnalysis(
  flightId: string
): Promise<IComprehensiveSafetyAnalysis> {
  // 1. Fetch flight with populated pilot & aircraft
  const flight = await Flight.findById(flightId)
    .populate('pilot')
    .populate('aircraft')
    .exec();

  if (!flight) {
    throw new Error(`Flight not found: ${flightId}`);
  }

  const pilot = flight.pilot as unknown as IPilot;
  const aircraft = flight.aircraft as unknown as IAircraft;
  const scheduledDateTime = flight.scheduledDateTime || flight.scheduledDate;

  if (!pilot || !aircraft) {
    throw new Error('Flight missing pilot or aircraft reference');
  }

  // 2. Fetch comprehensive weather data
  const routeWeather = await fetchRouteWeather(
    flight.departureAirport,
    flight.arrivalAirport,
    scheduledDateTime
  );

  // 3. Analyze weather vs pilot capabilities
  const weatherVsPilot = routeWeather.departure
    ? analyzeWeatherVsPilot(routeWeather.departure, {
      certificates: pilot.certificates,
      experience: pilot.experience,
      endorsements: pilot.endorsements,
    })
    : { legal: true, safeRecommendation: true, warnings: [], recommendations: [] };

  // 4. Analyze weather vs aircraft performance
  const weatherVsAircraft = routeWeather.departure
    ? analyzeWeatherVsAircraft(routeWeather.departure, {
      operatingLimits: aircraft.operatingLimits,
      model: aircraft.model,
    })
    : { safeToOperate: true, warnings: [], recommendations: [] };

  // 5. Analyze pilot currency and experience
  const pilotAnalysis = analyzePilot(pilot, scheduledDateTime);

  // 6. Analyze aircraft maintenance status
  const aircraftAnalysis = analyzeAircraft(aircraft, scheduledDateTime);

  // 7. Generate legality checks
  const legalityChecks = generateLegalityChecks(
    pilot,
    aircraft,
    routeWeather.departure,
    routeWeather.arrival,
    scheduledDateTime,
    weatherVsPilot,
    weatherVsAircraft
  );

  // 8. Analyze pilot familiarity with aircraft and route
  const familiarityAnalysis = analyzeFamiliarity(
    pilot,
    aircraft,
    flight.departureAirport,
    flight.arrivalAirport
  );

  // 9. Calculate combined risk scenarios
  const riskScenarios = calculateRiskScenarios(
    pilot,
    aircraft,
    routeWeather.departure,
    routeWeather.arrival,
    scheduledDateTime,
    pilotAnalysis,
    aircraftAnalysis
  );

  // Add familiarity-based risk scenarios
  if (familiarityAnalysis.aircraftFamiliarity.familiarityLevel === 'unfamiliar') {
    riskScenarios.push({
      title: 'Unfamiliar Aircraft',
      probability: 30,
      severity: 'high',
      description: `Pilot has no recorded experience in ${aircraft.tailNumber} or similar ${aircraft.model} type. Higher risk of systems mismanagement.`,
      mitigations: [
        'Complete thorough aircraft checkout',
        'Review POH emergency procedures',
        'Consider dual flight with type-experienced pilot',
      ],
    });
  } else if (familiarityAnalysis.aircraftFamiliarity.familiarityLevel === 'low') {
    riskScenarios.push({
      title: 'Limited Aircraft Experience',
      probability: 20,
      severity: 'medium',
      description: `Pilot has limited experience in this aircraft type (${familiarityAnalysis.aircraftFamiliarity.hoursInType.toFixed(1)} hours).`,
      mitigations: [
        'Review aircraft systems before flight',
        'Practice emergency procedures on ground',
      ],
    });
  }

  if (familiarityAnalysis.routeFamiliarity.familiarityLevel === 'unfamiliar') {
    riskScenarios.push({
      title: 'Unfamiliar Route/Airports',
      probability: 25,
      severity: 'medium',
      description: `Pilot has no recorded flights to ${flight.departureAirport}${flight.arrivalAirport ? ` or ${flight.arrivalAirport}` : ''}. Higher risk of navigation/pattern errors.`,
      mitigations: [
        'Study airport diagrams and procedures',
        'Brief NOTAMs and local traffic patterns',
        'Consider flight following with ATC',
      ],
    });
  }

  // Re-sort scenarios after adding familiarity ones
  riskScenarios.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  // 10. Calculate survival-based safety score
  const survivalScoreBreakdown = calculateSurvivalScore(
    pilotAnalysis,
    aircraftAnalysis,
    familiarityAnalysis,
    weatherVsPilot,
    weatherVsAircraft,
    routeWeather.departure,
    riskScenarios
  );

  // 11. Determine overall risk level and score
  const { overallRiskLevel, overallScore, goNoGoRecommendation, reasoning } = determineOverallStatus(
    legalityChecks,
    riskScenarios,
    weatherVsPilot,
    weatherVsAircraft,
    pilotAnalysis,
    aircraftAnalysis
  );

  // Use survival score as the primary score
  const finalScore = survivalScoreBreakdown.totalScore;

  // 12. Build comprehensive analysis with familiarity and survival score
  const analysis: IComprehensiveSafetyAnalysis = {
    generatedAt: new Date(),
    overallRiskLevel,
    overallScore: finalScore, // Use survival score as primary
    weatherAnalysis: {
      departureConditions: routeWeather.departure as IWeatherData | null,
      arrivalConditions: routeWeather.arrival as IWeatherData | null,
      enrouteHazards: routeWeather.enroute.map(h => h.description),
      weatherVsPilot,
      weatherVsAircraft,
    },
    pilotAnalysis,
    aircraftAnalysis,
    familiarityAnalysis,
    survivalScoreBreakdown,
    combinedRiskScenarios: riskScenarios,
    goNoGoRecommendation,
    reasoning: `${reasoning} | Survival Score: ${survivalScoreBreakdown.totalScore}/100 (${survivalScoreBreakdown.survivalProbability})`,
  };

  // 11. Update flight document
  flight.overallStatus = goNoGoRecommendation;
  flight.safetyAnalysisSnapshot = analysis;

  // AUTOMATED AGENTIC TRIGGER:
  // If the flight is high-risk and we haven't alerted yet, send the pre-flight agentic alert.
  if (goNoGoRecommendation === 'no-go' || goNoGoRecommendation === 'caution') {
    if (!flight.preFlightAlertSent) {
      try {
        console.log(`[SafetyAgent] High risk detected for flight ${flight._id}. Triggering agentic alert...`);
        // Use flight ID as token for the demo action links
        const emailPilotToken = flight._id.toString();
        const emailMechanicToken = flight._id.toString();

        await sendPreFlightAgenticAlert(flight, { emailPilotToken, emailMechanicToken });
        flight.preFlightAlertSent = true;
        console.log(`[SafetyAgent] Alert sent successfully.`);
      } catch (emailError) {
        console.error('[SafetyAgent] Failed to send alert:', emailError);
      }
    }
  } else {
    // If status returns to 'go', reset the flag so we can alert again if it degrades
    flight.preFlightAlertSent = false;
  }

  // Store weather data
  if (routeWeather.departure) {
    flight.weather = routeWeather.departure as IWeatherData;
  }
  if (routeWeather.arrival) {
    flight.arrivalWeather = routeWeather.arrival as IWeatherData;
  }

  await flight.save();

  return analysis;
}

// Analyze pilot status
function analyzePilot(
  pilot: IPilot,
  scheduledDate: Date
): IComprehensiveSafetyAnalysis['pilotAnalysis'] {
  const riskFactors: string[] = [];

  // Check currency
  const medicalExp = new Date(pilot.medicalExpiration);
  const bfrExp = new Date(pilot.flightReviewExpiration);
  const daysToMedical = Math.floor((medicalExp.getTime() - scheduledDate.getTime()) / 86400000);
  const daysToBFR = Math.floor((bfrExp.getTime() - scheduledDate.getTime()) / 86400000);

  let currencyStatus: 'current' | 'expiring' | 'expired' = 'current';
  if (daysToMedical < 0 || daysToBFR < 0) {
    currencyStatus = 'expired';
    if (daysToMedical < 0) riskFactors.push(`Medical expired ${Math.abs(daysToMedical)} days ago`);
    if (daysToBFR < 0) riskFactors.push(`Flight review expired ${Math.abs(daysToBFR)} days ago`);
  } else if (daysToMedical <= 30 || daysToBFR <= 30) {
    currencyStatus = 'expiring';
    if (daysToMedical <= 30) riskFactors.push(`Medical expires in ${daysToMedical} days`);
    if (daysToBFR <= 30) riskFactors.push(`Flight review expires in ${daysToBFR} days`);
  }

  // Determine experience level
  const totalHours = pilot.experience?.totalHours || 0;
  const certType = pilot.certificates?.type;

  let experienceLevel: 'student' | 'low_time' | 'experienced' | 'professional' = 'experienced';
  if (certType === 'Student') {
    experienceLevel = 'student';
    riskFactors.push('Student pilot - requires supervision');
  } else if (totalHours < 100) {
    experienceLevel = 'low_time';
    riskFactors.push(`Low-time pilot: ${totalHours} total hours`);
  } else if (certType === 'ATP' || totalHours > 1500) {
    experienceLevel = 'professional';
  }

  // Check recent proficiency
  const last90 = pilot.experience?.last90DaysHours || 0;
  if (last90 < 3) {
    riskFactors.push(`Very low recent activity: ${last90} hours in last 90 days`);
  } else if (last90 < 6) {
    riskFactors.push(`Low recent activity: ${last90} hours in last 90 days`);
  }

  // Check night currency for night flights
  const hour = scheduledDate.getHours();
  const isNight = hour >= 19 || hour <= 6;
  if (isNight && (pilot.experience?.nightHours || 0) < 20) {
    riskFactors.push(`Limited night experience: ${pilot.experience?.nightHours || 0} hours`);
  }

  // Get AI safety score if available
  const aiSafetyScore = pilot.safetyAnalysis?.score;

  return {
    currencyStatus,
    experienceLevel,
    qualifiedForConditions: currencyStatus !== 'expired',
    riskFactors,
    aiSafetyScore,
  };
}

// Analyze aircraft status
function analyzeAircraft(
  aircraft: IAircraft,
  scheduledDate: Date
): IComprehensiveSafetyAnalysis['aircraftAnalysis'] {
  const mechanicalRisks: string[] = [];

  // Check maintenance dates
  const annualDate = new Date(aircraft.maintenanceDates.annual);
  const oneYearLater = new Date(annualDate);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  const daysToAnnual = Math.floor((oneYearLater.getTime() - scheduledDate.getTime()) / 86400000);

  const transponderDate = new Date(aircraft.maintenanceDates.transponder);
  const twoYearsLater = new Date(transponderDate);
  twoYearsLater.setMonth(twoYearsLater.getMonth() + 24);
  const daysToTransponder = Math.floor((twoYearsLater.getTime() - scheduledDate.getTime()) / 86400000);

  let maintenanceStatus: 'current' | 'due_soon' | 'overdue' = 'current';
  if (daysToAnnual < 0 || daysToTransponder < 0) {
    maintenanceStatus = 'overdue';
    if (daysToAnnual < 0) mechanicalRisks.push(`Annual overdue by ${Math.abs(daysToAnnual)} days`);
    if (daysToTransponder < 0) mechanicalRisks.push(`Transponder check overdue`);
  } else if (daysToAnnual <= 30 || daysToTransponder <= 60) {
    maintenanceStatus = 'due_soon';
    if (daysToAnnual <= 30) mechanicalRisks.push(`Annual due in ${daysToAnnual} days`);
    if (daysToTransponder <= 60) mechanicalRisks.push(`Transponder due in ${daysToTransponder} days`);
  }

  // Check for high-time components
  const hobbs = aircraft.currentHours?.hobbs || 0;
  if (hobbs > 2000 && hobbs % 2000 > 1800) {
    mechanicalRisks.push(`Engine approaching TBO: ${Math.round(2000 - (hobbs % 2000))} hours to overhaul`);
  }

  // Check AI safety analysis findings
  if (aircraft.safetyAnalysis?.findings) {
    for (const finding of aircraft.safetyAnalysis.findings) {
      if (finding.status === 'critical') {
        mechanicalRisks.push(`CRITICAL: ${finding.component} - ${finding.message}`);
      } else if (finding.status === 'warning') {
        mechanicalRisks.push(`Warning: ${finding.component} - ${finding.message}`);
      }
    }
  }

  // Determine performance margins (simplified)
  let performanceMargins: 'adequate' | 'marginal' | 'inadequate' = 'adequate';
  if (maintenanceStatus === 'overdue') {
    performanceMargins = 'inadequate';
  } else if (mechanicalRisks.length > 2) {
    performanceMargins = 'marginal';
  }

  return {
    maintenanceStatus,
    performanceMargins,
    mechanicalRisks,
    aiSafetyScore: aircraft.safetyAnalysis?.score,
  };
}

// Generate legality checks
function generateLegalityChecks(
  pilot: IPilot,
  aircraft: IAircraft,
  departureWeather: IEnhancedWeatherData | null,
  arrivalWeather: IEnhancedWeatherData | null,
  scheduledDate: Date,
  weatherVsPilot: ReturnType<typeof analyzeWeatherVsPilot>,
  weatherVsAircraft: ReturnType<typeof analyzeWeatherVsAircraft>
): ILegalityCheck[] {
  const checks: ILegalityCheck[] = [];

  // Pilot medical
  const medicalExp = new Date(pilot.medicalExpiration);
  const daysToMedical = Math.floor((medicalExp.getTime() - scheduledDate.getTime()) / 86400000);
  checks.push({
    category: 'pilot',
    item: 'Medical Certificate',
    status: daysToMedical < 0 ? 'fail' : daysToMedical <= 30 ? 'warning' : 'pass',
    message: daysToMedical < 0
      ? `Expired ${Math.abs(daysToMedical)} days ago`
      : `Valid for ${daysToMedical} more days`,
  });

  // Flight review
  const bfrExp = new Date(pilot.flightReviewExpiration);
  const daysToBFR = Math.floor((bfrExp.getTime() - scheduledDate.getTime()) / 86400000);
  checks.push({
    category: 'pilot',
    item: 'Flight Review (BFR)',
    status: daysToBFR < 0 ? 'fail' : daysToBFR <= 30 ? 'warning' : 'pass',
    message: daysToBFR < 0
      ? `Expired ${Math.abs(daysToBFR)} days ago`
      : `Valid for ${daysToBFR} more days`,
  });

  // Annual inspection
  const annualDate = new Date(aircraft.maintenanceDates.annual);
  const oneYearLater = new Date(annualDate);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  const daysToAnnual = Math.floor((oneYearLater.getTime() - scheduledDate.getTime()) / 86400000);
  checks.push({
    category: 'maintenance',
    item: 'Annual Inspection',
    status: daysToAnnual < 0 ? 'fail' : daysToAnnual <= 30 ? 'warning' : 'pass',
    message: daysToAnnual < 0
      ? `Overdue by ${Math.abs(daysToAnnual)} days`
      : `Valid for ${daysToAnnual} more days`,
  });

  // Transponder
  const transponderDate = new Date(aircraft.maintenanceDates.transponder);
  const twoYearsLater = new Date(transponderDate);
  twoYearsLater.setMonth(twoYearsLater.getMonth() + 24);
  const daysToTransponder = Math.floor((twoYearsLater.getTime() - scheduledDate.getTime()) / 86400000);
  checks.push({
    category: 'maintenance',
    item: 'Transponder Check',
    status: daysToTransponder < 0 ? 'fail' : daysToTransponder <= 60 ? 'warning' : 'pass',
    message: daysToTransponder < 0
      ? `Overdue by ${Math.abs(daysToTransponder)} days`
      : `Valid for ${daysToTransponder} more days`,
  });

  // Weather vs pilot
  if (departureWeather) {
    checks.push({
      category: 'weather',
      item: 'Weather vs Pilot Qualifications',
      status: !weatherVsPilot.legal ? 'fail' : !weatherVsPilot.safeRecommendation ? 'warning' : 'pass',
      message: !weatherVsPilot.legal
        ? `Pilot not qualified for ${departureWeather.flightCategory} conditions`
        : weatherVsPilot.warnings.length > 0
          ? weatherVsPilot.warnings[0]
          : `Conditions acceptable for pilot qualifications`,
      details: weatherVsPilot.recommendations.join('; '),
    });

    // Weather vs aircraft
    checks.push({
      category: 'weather',
      item: 'Weather vs Aircraft Performance',
      status: !weatherVsAircraft.safeToOperate ? 'fail' : weatherVsAircraft.warnings.length > 0 ? 'warning' : 'pass',
      message: weatherVsAircraft.warnings.length > 0
        ? weatherVsAircraft.warnings[0]
        : 'Weather conditions within aircraft limits',
      details: weatherVsAircraft.recommendations.join('; '),
    });

    // Flight category
    checks.push({
      category: 'weather',
      item: 'Departure Weather',
      status: departureWeather.flightCategory === 'LIFR' ? 'fail'
        : departureWeather.flightCategory === 'IFR' && !pilot.certificates?.instrumentRated ? 'fail'
          : departureWeather.flightCategory !== 'VFR' ? 'warning'
            : 'pass',
      message: `${departureWeather.flightCategory} - Ceiling ${departureWeather.ceiling || 'CLR'}, Vis ${departureWeather.visibility}SM`,
      details: departureWeather.metar,
    });
  }

  // Arrival weather (if cross-country)
  if (arrivalWeather) {
    checks.push({
      category: 'weather',
      item: 'Destination Weather',
      status: arrivalWeather.flightCategory === 'LIFR' ? 'fail'
        : arrivalWeather.flightCategory === 'IFR' && !pilot.certificates?.instrumentRated ? 'fail'
          : arrivalWeather.flightCategory !== 'VFR' ? 'warning'
            : 'pass',
      message: `${arrivalWeather.flightCategory} - Ceiling ${arrivalWeather.ceiling || 'CLR'}, Vis ${arrivalWeather.visibility}SM`,
      details: arrivalWeather.metar,
    });
  }

  // Performance check (density altitude)
  if (departureWeather?.densityAltitude) {
    checks.push({
      category: 'performance',
      item: 'Density Altitude',
      status: departureWeather.densityAltitude > 9000 ? 'fail'
        : departureWeather.densityAltitude > 7000 ? 'warning'
          : 'pass',
      message: `${departureWeather.densityAltitude}ft density altitude`,
      details: departureWeather.densityAltitude > 7000
        ? 'Expect reduced aircraft performance'
        : undefined,
    });
  }

  return checks;
}

// Calculate risk scenarios
function calculateRiskScenarios(
  pilot: IPilot,
  aircraft: IAircraft,
  departureWeather: IEnhancedWeatherData | null,
  arrivalWeather: IEnhancedWeatherData | null,
  scheduledDate: Date,
  pilotAnalysis: IComprehensiveSafetyAnalysis['pilotAnalysis'],
  aircraftAnalysis: IComprehensiveSafetyAnalysis['aircraftAnalysis']
): IRiskScenario[] {
  const scenarios: IRiskScenario[] = [];
  const hour = scheduledDate.getHours();
  const isNight = hour >= 19 || hour <= 6;
  const airframeHours = aircraft.currentHours?.hobbs || 0;

  // Electrical failure scenario
  const alternatorRisk = Math.min(Math.round((airframeHours % 500) / 500 * 15), 15);
  let alternatorSeverity: IRiskScenario['severity'] = 'low';
  if (isNight && alternatorRisk > 5) alternatorSeverity = 'high';
  if (isNight && (pilot.experience?.nightHours || 0) < 20) alternatorSeverity = 'critical';

  scenarios.push({
    title: 'Electrical Failure',
    probability: alternatorRisk,
    severity: alternatorSeverity,
    description: isNight
      ? `${alternatorRisk}% alternator failure risk. Night flight - loss of lights/radios would be critical.`
      : `${alternatorRisk}% alternator failure risk. Daylight operations reduce impact.`,
    mitigations: [
      'Carry backup flashlight and handheld radio',
      'Know nearest VFR airports',
      'Review no-radio procedures',
    ],
  });

  // Weather deterioration
  if (departureWeather) {
    let wxRisk = 5;
    if (departureWeather.flightCategory === 'MVFR') wxRisk = 20;
    if (departureWeather.flightCategory === 'IFR') wxRisk = 40;
    if (departureWeather.flightCategory === 'LIFR') wxRisk = 60;

    // Adjust for trend
    if (departureWeather.trend === 'deteriorating') wxRisk += 15;
    if (departureWeather.trend === 'improving') wxRisk -= 10;

    const isIRPilot = pilot.certificates?.instrumentRated;
    let wxSeverity: IRiskScenario['severity'] = 'low';
    if (wxRisk >= 20 && !isIRPilot) wxSeverity = 'high';
    if (wxRisk >= 40 && !isIRPilot) wxSeverity = 'critical';

    scenarios.push({
      title: 'Weather Deterioration',
      probability: Math.min(wxRisk, 80),
      severity: wxSeverity,
      description: `${departureWeather.flightCategory} conditions${departureWeather.trend ? ` (${departureWeather.trend})` : ''}.${!isIRPilot && wxRisk >= 20 ? ' VFR pilot - inadvertent IMC could be fatal.' : ''
        }`,
      mitigations: isIRPilot
        ? ['File IFR flight plan', 'Review approach plates', 'Check alternates']
        : ['Get VFR weather briefing', 'Plan 180° turn procedure', 'Know escape routes'],
    });
  }

  // Pilot proficiency
  if (pilotAnalysis.experienceLevel === 'student' || pilotAnalysis.experienceLevel === 'low_time') {
    const expRisk = pilotAnalysis.experienceLevel === 'student' ? 25 : 15;
    let expSeverity: IRiskScenario['severity'] = 'medium';
    if (pilotAnalysis.experienceLevel === 'student' && isNight) expSeverity = 'critical';

    scenarios.push({
      title: 'Pilot Inexperience',
      probability: expRisk,
      severity: expSeverity,
      description: pilotAnalysis.experienceLevel === 'student'
        ? `Student pilot. ${isNight ? 'NIGHT FLIGHT - requires endorsement and instructor.' : ''}`
        : `Low-time pilot (${pilot.experience?.totalHours || 0} hrs). Higher decision-making risk.`,
      mitigations: [
        'Thorough preflight briefing',
        'Review emergency procedures',
        'Consider flying with experienced pilot',
      ],
    });
  }

  // Low proficiency
  if (pilotAnalysis.riskFactors.some(r => r.includes('recent activity'))) {
    scenarios.push({
      title: 'Skill Degradation',
      probability: 25,
      severity: 'high',
      description: `Low recent flight activity. Skills may be degraded, particularly in emergencies.`,
      mitigations: [
        'Consider a refresher flight with CFI',
        'Practice ground emergency procedures',
        'Start with familiar airport and aircraft',
      ],
    });
  }

  // Engine failure
  const engineHours = airframeHours % 2000;
  const engineRisk = Math.min(Math.round(engineHours / 2000 * 10), 10);
  scenarios.push({
    title: 'Engine Failure',
    probability: engineRisk,
    severity: engineRisk > 5 ? 'medium' : 'low',
    description: `${engineRisk}% risk based on TBO position. ${Math.round(2000 - engineHours)} hrs to recommended overhaul.`,
    mitigations: [
      'Brief emergency landing spots along route',
      'Review engine-out procedures',
      'Monitor engine instruments closely',
    ],
  });

  // High density altitude
  if (departureWeather?.densityAltitude && departureWeather.densityAltitude > 5000) {
    scenarios.push({
      title: 'High Density Altitude Operations',
      probability: 30,
      severity: departureWeather.densityAltitude > 8000 ? 'high' : 'medium',
      description: `Density altitude ${departureWeather.densityAltitude}ft. Reduced climb, longer takeoff roll.`,
      mitigations: [
        'Reduce weight if possible',
        'Use full length of runway',
        'Plan for reduced climb rate',
        'Consider early morning departure',
      ],
    });
  }

  // Mechanical issues from AI analysis
  if (aircraftAnalysis.mechanicalRisks.some(r => r.includes('CRITICAL'))) {
    scenarios.push({
      title: 'Known Mechanical Issue',
      probability: 70,
      severity: 'critical',
      description: `AI maintenance analysis detected critical issues. Aircraft may not be airworthy.`,
      mitigations: [
        'VERIFY with A&P mechanic before flight',
        'Review squawk history',
        'Consider alternative aircraft',
      ],
    });
  }

  // Combined risk factor
  const hasPilotRisk = (pilot.safetyAnalysis?.score || 0) > 7;
  const hasAircraftRisk = aircraftAnalysis.mechanicalRisks.length > 2;
  if (hasPilotRisk && hasAircraftRisk) {
    scenarios.push({
      title: 'Combined Risk Factor',
      probability: 60,
      severity: 'critical',
      description: `Multiple compounding risk factors detected. High-risk pilot profile combined with aircraft concerns.`,
      mitigations: [
        'Strongly consider postponing flight',
        'Use different aircraft if available',
        'Fly with more experienced pilot',
      ],
    });
  }

  // Sort by severity
  return scenarios.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

// Determine overall status
function determineOverallStatus(
  checks: ILegalityCheck[],
  scenarios: IRiskScenario[],
  weatherVsPilot: ReturnType<typeof analyzeWeatherVsPilot>,
  weatherVsAircraft: ReturnType<typeof analyzeWeatherVsAircraft>,
  pilotAnalysis: IComprehensiveSafetyAnalysis['pilotAnalysis'],
  aircraftAnalysis: IComprehensiveSafetyAnalysis['aircraftAnalysis']
): {
  overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  overallScore: number;
  goNoGoRecommendation: 'go' | 'caution' | 'no-go';
  reasoning: string;
} {
  const failedChecks = checks.filter(c => c.status === 'fail');
  const warningChecks = checks.filter(c => c.status === 'warning');
  const criticalScenarios = scenarios.filter(s => s.severity === 'critical');
  const highScenarios = scenarios.filter(s => s.severity === 'high');

  // Calculate score (100 = safest)
  let score = 100;
  score -= failedChecks.length * 25; // Major deductions for failures
  score -= warningChecks.length * 5; // Minor deductions for warnings
  score -= criticalScenarios.length * 20;
  score -= highScenarios.length * 10;

  if (!weatherVsPilot.legal) score -= 30;
  if (!weatherVsPilot.safeRecommendation) score -= 15;
  if (!weatherVsAircraft.safeToOperate) score -= 25;

  if (pilotAnalysis.currencyStatus === 'expired') score -= 30;
  if (pilotAnalysis.currencyStatus === 'expiring') score -= 10;
  if (aircraftAnalysis.maintenanceStatus === 'overdue') score -= 30;
  if (aircraftAnalysis.maintenanceStatus === 'due_soon') score -= 10;

  score = Math.max(0, Math.min(100, score));

  // Determine risk level
  let overallRiskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (score < 30 || criticalScenarios.length > 0 || failedChecks.length > 0) {
    overallRiskLevel = 'critical';
  } else if (score < 50 || highScenarios.length > 1) {
    overallRiskLevel = 'high';
  } else if (score < 70 || warningChecks.length > 2) {
    overallRiskLevel = 'medium';
  }

  // Determine go/no-go
  let goNoGoRecommendation: 'go' | 'caution' | 'no-go' = 'go';
  let reasoning = '';

  if (failedChecks.length > 0 || !weatherVsPilot.legal || pilotAnalysis.currencyStatus === 'expired' || aircraftAnalysis.maintenanceStatus === 'overdue') {
    goNoGoRecommendation = 'no-go';
    reasoning = 'Flight grounded due to: ' + [
      ...failedChecks.map(c => c.item),
      !weatherVsPilot.legal ? 'Weather exceeds pilot qualifications' : null,
      pilotAnalysis.currencyStatus === 'expired' ? 'Pilot currency expired' : null,
      aircraftAnalysis.maintenanceStatus === 'overdue' ? 'Maintenance overdue' : null,
    ].filter(Boolean).join(', ');
  } else if (warningChecks.length > 0 || criticalScenarios.length > 0 || !weatherVsPilot.safeRecommendation) {
    goNoGoRecommendation = 'caution';
    reasoning = 'Proceed with caution. Risk factors: ' + [
      ...warningChecks.map(c => c.item),
      ...criticalScenarios.map(s => s.title),
    ].slice(0, 3).join(', ');
  } else {
    reasoning = 'All systems GO. Weather, pilot, and aircraft status are satisfactory.';
  }

  return {
    overallRiskLevel,
    overallScore: score,
    goNoGoRecommendation,
    reasoning,
  };
}

// Analyze pilot familiarity with aircraft and route
function analyzeFamiliarity(
  pilot: IPilot,
  aircraft: IAircraft,
  departureAirport: string,
  arrivalAirport?: string
): IFamiliarityAnalysis {
  const riskFactors: string[] = [];
  const flightEntries = pilot.flightEntries || [];
  const tailNumber = aircraft.tailNumber?.toUpperCase();
  const aircraftModel = aircraft.model?.toLowerCase();

  // Aircraft familiarity - check flights in this tail number and type
  let tailNumberFlights = 0;
  let typeFlights = 0;
  let hoursInType = 0;
  let lastFlownDate: Date | undefined;

  for (const entry of flightEntries) {
    const entryTail = entry.aircraftIdent?.toUpperCase();
    const entryType = entry.aircraftType?.toLowerCase();

    // Check tail number match
    if (entryTail === tailNumber) {
      tailNumberFlights++;
      if (!lastFlownDate || new Date(entry.date) > lastFlownDate) {
        lastFlownDate = new Date(entry.date);
      }
    }

    // Check aircraft type match (fuzzy match)
    if (entryType && aircraftModel && (
      entryType.includes(aircraftModel) ||
      aircraftModel.includes(entryType) ||
      entryType.split(' ')[0] === aircraftModel.split(' ')[0]
    )) {
      typeFlights++;
      hoursInType += entry.totalTime || 0;
    }
  }

  // Determine aircraft familiarity level
  let aircraftFamiliarityLevel: 'unfamiliar' | 'low' | 'moderate' | 'high' = 'unfamiliar';
  if (tailNumberFlights >= 10 || hoursInType >= 50) {
    aircraftFamiliarityLevel = 'high';
  } else if (tailNumberFlights >= 3 || hoursInType >= 20) {
    aircraftFamiliarityLevel = 'moderate';
  } else if (tailNumberFlights >= 1 || typeFlights >= 1) {
    aircraftFamiliarityLevel = 'low';
  }

  // Route familiarity - check airports visited
  const depAirport = departureAirport?.toUpperCase();
  const arrAirport = arrivalAirport?.toUpperCase();
  let departureVisits = 0;
  let arrivalVisits = 0;
  let routeFlown = false;

  for (const entry of flightEntries) {
    const from = entry.from?.toUpperCase();
    const to = entry.to?.toUpperCase();

    if (from === depAirport || to === depAirport) departureVisits++;
    if (arrAirport && (from === arrAirport || to === arrAirport)) arrivalVisits++;

    // Check if exact route was flown
    if (from === depAirport && to === arrAirport) routeFlown = true;
    if (from === arrAirport && to === depAirport) routeFlown = true;
  }

  // Determine route familiarity level
  let routeFamiliarityLevel: 'unfamiliar' | 'low' | 'moderate' | 'high' = 'unfamiliar';
  if (routeFlown || (departureVisits >= 5 && (!arrAirport || arrivalVisits >= 5))) {
    routeFamiliarityLevel = 'high';
  } else if (departureVisits >= 2 && (!arrAirport || arrivalVisits >= 2)) {
    routeFamiliarityLevel = 'moderate';
  } else if (departureVisits >= 1 || arrivalVisits >= 1) {
    routeFamiliarityLevel = 'low';
  }

  // Calculate overall familiarity score (0-100)
  let overallFamiliarityScore = 0;

  // Aircraft familiarity (50 points)
  if (aircraftFamiliarityLevel === 'high') overallFamiliarityScore += 50;
  else if (aircraftFamiliarityLevel === 'moderate') overallFamiliarityScore += 35;
  else if (aircraftFamiliarityLevel === 'low') overallFamiliarityScore += 20;

  // Route familiarity (50 points)
  if (routeFamiliarityLevel === 'high') overallFamiliarityScore += 50;
  else if (routeFamiliarityLevel === 'moderate') overallFamiliarityScore += 35;
  else if (routeFamiliarityLevel === 'low') overallFamiliarityScore += 20;

  // Generate risk factors
  if (aircraftFamiliarityLevel === 'unfamiliar') {
    riskFactors.push(`No prior flights in ${tailNumber || 'this aircraft'} or similar type`);
  } else if (aircraftFamiliarityLevel === 'low') {
    riskFactors.push(`Limited experience in ${aircraftModel || 'this type'}: ${typeFlights} flights, ${hoursInType.toFixed(1)} hours`);
  }

  if (routeFamiliarityLevel === 'unfamiliar') {
    riskFactors.push(`No prior visits to ${depAirport}${arrAirport ? ` or ${arrAirport}` : ''}`);
  } else if (routeFamiliarityLevel === 'low') {
    riskFactors.push(`Limited familiarity with route: ${departureVisits} visits to departure${arrAirport ? `, ${arrivalVisits} to destination` : ''}`);
  }

  // Check recency - unfamiliar with aircraft if not flown in 90 days
  if (lastFlownDate) {
    const daysSinceFlown = Math.floor((Date.now() - lastFlownDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceFlown > 90) {
      riskFactors.push(`Last flew this aircraft ${daysSinceFlown} days ago - skills may have degraded`);
      overallFamiliarityScore = Math.max(0, overallFamiliarityScore - 20);
    }
  }

  return {
    aircraftFamiliarity: {
      tailNumberFlights,
      typeFlights,
      hoursInType,
      lastFlownDate,
      familiarityLevel: aircraftFamiliarityLevel,
    },
    routeFamiliarity: {
      departureVisits,
      arrivalVisits,
      routeFlown,
      familiarityLevel: routeFamiliarityLevel,
    },
    overallFamiliarityScore,
    riskFactors,
  };
}

// Calculate survival-based safety score /100
function calculateSurvivalScore(
  pilotAnalysis: IComprehensiveSafetyAnalysis['pilotAnalysis'],
  aircraftAnalysis: IComprehensiveSafetyAnalysis['aircraftAnalysis'],
  familiarityAnalysis: IFamiliarityAnalysis,
  weatherVsPilot: ReturnType<typeof analyzeWeatherVsPilot>,
  weatherVsAircraft: ReturnType<typeof analyzeWeatherVsAircraft>,
  departureWeather: IEnhancedWeatherData | null,
  scenarios: IRiskScenario[]
): ISurvivalScoreBreakdown {
  // Aircraft Score (/25) - based on maintenance and AI safety analysis
  let aircraftScore = 25;
  if (aircraftAnalysis.maintenanceStatus === 'overdue') aircraftScore -= 15;
  else if (aircraftAnalysis.maintenanceStatus === 'due_soon') aircraftScore -= 5;

  if (aircraftAnalysis.mechanicalRisks.some(r => r.includes('CRITICAL'))) aircraftScore -= 10;
  else if (aircraftAnalysis.mechanicalRisks.length > 2) aircraftScore -= 5;

  // Factor in AI safety score if available (100-based, convert to adjustment)
  if (aircraftAnalysis.aiSafetyScore !== undefined) {
    const aiAdjust = ((aircraftAnalysis.aiSafetyScore - 50) / 100) * 10;
    aircraftScore += aiAdjust;
  }
  aircraftScore = Math.max(0, Math.min(25, aircraftScore));

  // Pilot Score (/25) - based on currency, experience, and AI safety analysis
  let pilotScore = 25;
  if (pilotAnalysis.currencyStatus === 'expired') pilotScore -= 15;
  else if (pilotAnalysis.currencyStatus === 'expiring') pilotScore -= 5;

  if (pilotAnalysis.experienceLevel === 'student') pilotScore -= 8;
  else if (pilotAnalysis.experienceLevel === 'low_time') pilotScore -= 4;

  if (!pilotAnalysis.qualifiedForConditions) pilotScore -= 10;

  // Factor in AI safety score (10-based, convert to adjustment)
  if (pilotAnalysis.aiSafetyScore !== undefined) {
    // Higher score = higher risk in pilot analysis (10 = bad)
    const aiAdjust = ((10 - pilotAnalysis.aiSafetyScore) / 10) * 5;
    pilotScore += aiAdjust;
  }
  pilotScore = Math.max(0, Math.min(25, pilotScore));

  // Weather Score (/20) - based on flight category and conditions
  let weatherScore = 20;
  if (departureWeather) {
    if (departureWeather.flightCategory === 'LIFR') weatherScore -= 18;
    else if (departureWeather.flightCategory === 'IFR') weatherScore -= 12;
    else if (departureWeather.flightCategory === 'MVFR') weatherScore -= 6;

    if (departureWeather.trend === 'deteriorating') weatherScore -= 4;
    if ((departureWeather.wind?.gust || 0) > 25) weatherScore -= 4;
    if ((departureWeather.densityAltitude || 0) > 7000) weatherScore -= 4;
  }

  if (!weatherVsPilot.legal) weatherScore -= 10;
  if (!weatherVsPilot.safeRecommendation) weatherScore -= 5;
  if (!weatherVsAircraft.safeToOperate) weatherScore -= 8;

  weatherScore = Math.max(0, Math.min(20, weatherScore));

  // Familiarity Score (/15) - pilot familiarity with aircraft and route
  let familiarityScore = Math.round(familiarityAnalysis.overallFamiliarityScore * 0.15);
  familiarityScore = Math.max(0, Math.min(15, familiarityScore));

  // Failure Probability Score (/15) - based on component failure probabilities
  let failureProbScore = 15;
  const criticalScenarios = scenarios.filter(s => s.severity === 'critical');
  const highScenarios = scenarios.filter(s => s.severity === 'high');

  // Deduct for high-probability failure scenarios
  for (const scenario of criticalScenarios) {
    failureProbScore -= Math.min(5, scenario.probability / 10);
  }
  for (const scenario of highScenarios) {
    failureProbScore -= Math.min(3, scenario.probability / 15);
  }
  failureProbScore = Math.max(0, Math.min(15, failureProbScore));

  // Calculate total survival score
  const totalScore = Math.round(aircraftScore + pilotScore + weatherScore + familiarityScore + failureProbScore);

  // Determine survival probability text
  let survivalProbability = 'Very High';
  if (totalScore < 30) survivalProbability = 'Critical Risk';
  else if (totalScore < 50) survivalProbability = 'High Risk';
  else if (totalScore < 70) survivalProbability = 'Moderate Risk';
  else if (totalScore < 85) survivalProbability = 'Low Risk';

  return {
    aircraftScore: Math.round(aircraftScore),
    pilotScore: Math.round(pilotScore),
    weatherScore: Math.round(weatherScore),
    familiarityScore,
    failureProbScore: Math.round(failureProbScore),
    totalScore,
    survivalProbability,
  };
}

// Export for use in audit API
export async function runQuickAudit(flightId: string): Promise<{
  overallStatus: 'go' | 'caution' | 'no-go';
  checks: ILegalityCheck[];
  summary: string;
}> {
  const analysis = await runComprehensiveSafetyAnalysis(flightId);

  return {
    overallStatus: analysis.goNoGoRecommendation,
    checks: (await Flight.findById(flightId))?.legalityChecks || [],
    summary: analysis.reasoning,
  };
}
