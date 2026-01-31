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

// Risk scenario interface
interface IRiskScenario {
  title: string;
  probability: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  mitigations?: string[];
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

  // 8. Calculate combined risk scenarios
  const riskScenarios = calculateRiskScenarios(
    pilot,
    aircraft,
    routeWeather.departure,
    routeWeather.arrival,
    scheduledDateTime,
    pilotAnalysis,
    aircraftAnalysis
  );

  // 9. Determine overall risk level and score
  const { overallRiskLevel, overallScore, goNoGoRecommendation, reasoning } = determineOverallStatus(
    legalityChecks,
    riskScenarios,
    weatherVsPilot,
    weatherVsAircraft,
    pilotAnalysis,
    aircraftAnalysis
  );

  // 10. Build comprehensive analysis
  const analysis: IComprehensiveSafetyAnalysis = {
    generatedAt: new Date(),
    overallRiskLevel,
    overallScore,
    weatherAnalysis: {
      departureConditions: routeWeather.departure as IWeatherData | null,
      arrivalConditions: routeWeather.arrival as IWeatherData | null,
      enrouteHazards: routeWeather.enroute.map(h => h.description),
      weatherVsPilot,
      weatherVsAircraft,
    },
    pilotAnalysis,
    aircraftAnalysis,
    combinedRiskScenarios: riskScenarios,
    goNoGoRecommendation,
    reasoning,
  };

  // 11. Update flight document
  flight.legalityChecks = legalityChecks;
  flight.overallStatus = goNoGoRecommendation;
  flight.safetyAnalysisSnapshot = analysis;

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
      description: `${departureWeather.flightCategory} conditions${departureWeather.trend ? ` (${departureWeather.trend})` : ''}.${
        !isIRPilot && wxRisk >= 20 ? ' VFR pilot - inadvertent IMC could be fatal.' : ''
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
