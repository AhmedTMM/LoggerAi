// Legality Service - Core compliance engine for flight audits
// Determines Go/Caution/No-Go based on FAA regulations
// Now integrates with comprehensive safety analysis for enhanced auditing

import Flight, { IFlight, ILegalityCheck, IWeatherData } from '@/lib/models/Flight';
import { IAircraft } from '@/lib/models/Aircraft';
import { IPilot } from '@/lib/models/Pilot';
import { fetchWeatherData, fetchEnhancedWeatherData, fetchRouteWeather } from './weatherService';
import { runComprehensiveSafetyAnalysis } from './comprehensiveSafetyService';

export interface IRiskScenario {
    title: string;
    probability: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
}

export interface AuditResult {
    overallStatus: 'go' | 'caution' | 'no-go';
    checks: ILegalityCheck[];
    summary: string;
    riskScenarios: IRiskScenario[];
}

// ============================================
// MAINTENANCE CHECKS
// ============================================

function checkAnnualInspection(aircraft: IAircraft, asOf: Date): ILegalityCheck {
    const annualDate = new Date(aircraft.maintenanceDates.annual);
    const oneYearLater = new Date(annualDate);
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    const isOverdue = asOf > oneYearLater;
    const daysUntilDue = Math.floor((oneYearLater.getTime() - asOf.getTime()) / 86400000);

    if (isOverdue) {
        return {
            category: 'maintenance',
            item: 'Annual Inspection',
            status: 'fail',
            message: `Annual overdue by ${Math.abs(daysUntilDue)} days`,
            details: `Last annual: ${annualDate.toLocaleDateString()}`,
        };
    }

    if (daysUntilDue <= 30) {
        return {
            category: 'maintenance',
            item: 'Annual Inspection',
            status: 'warning',
            message: `Annual due in ${daysUntilDue} days`,
            details: `Due by: ${oneYearLater.toLocaleDateString()}`,
        };
    }

    return {
        category: 'maintenance',
        item: 'Annual Inspection',
        status: 'pass',
        message: `Annual valid until ${oneYearLater.toLocaleDateString()}`,
    };
}

function checkTransponder(aircraft: IAircraft, asOf: Date): ILegalityCheck {
    const transponderDate = new Date(aircraft.maintenanceDates.transponder);
    const twoYearsLater = new Date(transponderDate);
    twoYearsLater.setMonth(twoYearsLater.getMonth() + 24);

    const isOverdue = asOf > twoYearsLater;
    const daysUntilDue = Math.floor((twoYearsLater.getTime() - asOf.getTime()) / 86400000);

    if (isOverdue) {
        return {
            category: 'maintenance',
            item: 'Transponder Check',
            status: 'fail',
            message: `Transponder check overdue by ${Math.abs(daysUntilDue)} days`,
            details: `Last check: ${transponderDate.toLocaleDateString()}`,
        };
    }

    if (daysUntilDue <= 60) {
        return {
            category: 'maintenance',
            item: 'Transponder Check',
            status: 'warning',
            message: `Transponder due in ${daysUntilDue} days`,
        };
    }

    return {
        category: 'maintenance',
        item: 'Transponder Check',
        status: 'pass',
        message: `Transponder valid until ${twoYearsLater.toLocaleDateString()}`,
    };
}

function checkStaticSystem(aircraft: IAircraft, asOf: Date, isIFR: boolean): ILegalityCheck {
    if (!isIFR) {
        return {
            category: 'maintenance',
            item: 'Static System (IFR)',
            status: 'pass',
            message: 'N/A for VFR flight',
        };
    }

    const staticDate = new Date(aircraft.maintenanceDates.staticSystem);
    const twoYearsLater = new Date(staticDate);
    twoYearsLater.setMonth(twoYearsLater.getMonth() + 24);

    const isOverdue = asOf > twoYearsLater;
    const daysUntilDue = Math.floor((twoYearsLater.getTime() - asOf.getTime()) / 86400000);

    if (isOverdue) {
        return {
            category: 'maintenance',
            item: 'Static System (IFR)',
            status: 'fail',
            message: `Static system check overdue for IFR`,
            details: `Last check: ${staticDate.toLocaleDateString()}`,
        };
    }

    return {
        category: 'maintenance',
        item: 'Static System (IFR)',
        status: 'pass',
        message: `Static system valid until ${twoYearsLater.toLocaleDateString()}`,
    };
}

function checkHundredHour(aircraft: IAircraft, asOf: Date, isForHire: boolean): ILegalityCheck {
    if (!isForHire || !aircraft.maintenanceDates.hundredHour) {
        return {
            category: 'maintenance',
            item: '100-Hour Inspection',
            status: 'pass',
            message: 'N/A (not for-hire)',
        };
    }

    // Find last 100-hour from logs or maintenanceDates
    const lastHundredHour = aircraft.maintenanceDates.hundredHour;
    const lastLog = aircraft.logs?.find(l => l.description.toLowerCase().includes('100'));
    const lastTachAtHundred = lastLog?.tachTime || 0;
    const currentTach = aircraft.currentHours.tach;
    const hoursSince = currentTach - lastTachAtHundred;

    if (hoursSince >= 100) {
        return {
            category: 'maintenance',
            item: '100-Hour Inspection',
            status: 'fail',
            message: `100-hour overdue by ${(hoursSince - 100).toFixed(1)} hours`,
            details: `Current tach: ${currentTach}, Last 100-hr at: ${lastTachAtHundred}`,
        };
    }

    if (hoursSince >= 90) {
        return {
            category: 'maintenance',
            item: '100-Hour Inspection',
            status: 'warning',
            message: `100-hour due in ${(100 - hoursSince).toFixed(1)} hours`,
        };
    }

    return {
        category: 'maintenance',
        item: '100-Hour Inspection',
        status: 'pass',
        message: `100-hour not due for ${(100 - hoursSince).toFixed(1)} more hours`,
    };
}

// ============================================
// PILOT CURRENCY CHECKS
// ============================================

function checkMedical(pilot: IPilot, asOf: Date): ILegalityCheck {
    const medicalExp = new Date(pilot.medicalExpiration);
    const isExpired = asOf > medicalExp;
    const daysUntilExp = Math.floor((medicalExp.getTime() - asOf.getTime()) / 86400000);

    if (isExpired) {
        return {
            category: 'pilot',
            item: 'Medical Certificate',
            status: 'fail',
            message: `Medical expired on ${medicalExp.toLocaleDateString()}`,
        };
    }

    if (daysUntilExp <= 30) {
        return {
            category: 'pilot',
            item: 'Medical Certificate',
            status: 'warning',
            message: `Medical expires in ${daysUntilExp} days`,
        };
    }

    return {
        category: 'pilot',
        item: 'Medical Certificate',
        status: 'pass',
        message: `Medical valid until ${medicalExp.toLocaleDateString()}`,
    };
}

function checkFlightReview(pilot: IPilot, asOf: Date): ILegalityCheck {
    const bfrExp = new Date(pilot.flightReviewExpiration);
    const isExpired = asOf > bfrExp;
    const daysUntilExp = Math.floor((bfrExp.getTime() - asOf.getTime()) / 86400000);

    if (isExpired) {
        return {
            category: 'pilot',
            item: 'Flight Review (BFR)',
            status: 'fail',
            message: `Flight review expired on ${bfrExp.toLocaleDateString()}`,
        };
    }

    if (daysUntilExp <= 30) {
        return {
            category: 'pilot',
            item: 'Flight Review (BFR)',
            status: 'warning',
            message: `Flight review expires in ${daysUntilExp} days`,
        };
    }

    return {
        category: 'pilot',
        item: 'Flight Review (BFR)',
        status: 'pass',
        message: `Flight review valid until ${bfrExp.toLocaleDateString()}`,
    };
}

// ============================================
// WEATHER / SAFETY CHECKS
// ============================================

function checkWeatherVsPilot(
    flightCategory: 'VFR' | 'MVFR' | 'IFR' | 'LIFR',
    wind: { speed: number; gust?: number },
    pilot: IPilot
): ILegalityCheck[] {
    const checks: ILegalityCheck[] = [];

    // IFR/LIFR conditions check
    if ((flightCategory === 'IFR' || flightCategory === 'LIFR') && !pilot.certificates.instrumentRated) {
        checks.push({
            category: 'safety',
            item: 'Weather vs. Ratings',
            status: 'fail',
            message: `${flightCategory} conditions require instrument rating`,
            details: `Pilot ${pilot.name} is VFR-only`,
        });
    } else if (flightCategory === 'MVFR' && (pilot.experience?.totalHours || 0) < 100) {
        checks.push({
            category: 'safety',
            item: 'Weather vs. Experience',
            status: 'warning',
            message: 'MVFR conditions not recommended for low-time pilots',
            details: `Pilot has ${pilot.experience?.totalHours || 0} total hours`,
        });
    } else {
        checks.push({
            category: 'safety',
            item: 'Weather vs. Ratings',
            status: 'pass',
            message: `${flightCategory} conditions OK for pilot qualifications`,
        });
    }

    // Wind checks
    const maxWind = Math.max(wind.speed, wind.gust || 0);
    if (maxWind >= 30) {
        checks.push({
            category: 'safety',
            item: 'Wind Conditions',
            status: 'fail',
            message: `Excessive winds: ${wind.speed}kts${wind.gust ? ` gusting ${wind.gust}kts` : ''}`,
        });
    } else if (maxWind >= 20) {
        checks.push({
            category: 'safety',
            item: 'Wind Conditions',
            status: 'warning',
            message: `High winds: ${wind.speed}kts${wind.gust ? ` gusting ${wind.gust}kts` : ''}`,
        });
    } else {
        checks.push({
            category: 'safety',
            item: 'Wind Conditions',
            status: 'pass',
            message: `Winds acceptable: ${wind.speed}kts`,
        });
    }

    return checks;
}

// ============================================
// OVERALL STATUS CALCULATION
// ============================================

function calculateOverallStatus(checks: ILegalityCheck[]): 'go' | 'caution' | 'no-go' {
    if (checks.some(c => c.status === 'fail')) return 'no-go';
    if (checks.some(c => c.status === 'warning')) return 'caution';
    return 'go';
}

function generateSummary(checks: ILegalityCheck[], overallStatus: string): string {
    const failedChecks = checks.filter(c => c.status === 'fail');
    const warnings = checks.filter(c => c.status === 'warning');

    if (overallStatus === 'go') {
        return '✅ All systems GO. Flight is legal and safe to operate.';
    }

    let summary = overallStatus === 'no-go' ? '🛑 FLIGHT GROUNDED\n\n' : '⚠️ FLIGHT CAUTION\n\n';

    if (failedChecks.length > 0) {
        summary += 'Critical Issues:\n';
        failedChecks.forEach(c => {
            summary += `• ${c.item}: ${c.message}\n`;
        });
        summary += '\n';
    }

    if (warnings.length > 0) {
        summary += 'Warnings:\n';
        warnings.forEach(c => {
            summary += `• ${c.item}: ${c.message}\n`;
        });
    }

    return summary;
}

// ============================================
// MAIN AUDIT FUNCTION
// ============================================

export async function runLegalityAudit(flightId: string, useComprehensive: boolean = true): Promise<AuditResult> {
    // Use comprehensive safety analysis for enhanced auditing
    if (useComprehensive) {
        try {
            const comprehensiveAnalysis = await runComprehensiveSafetyAnalysis(flightId);

            // Fetch updated flight
            const flight = await Flight.findById(flightId);

            return {
                overallStatus: comprehensiveAnalysis.goNoGoRecommendation,
                checks: flight?.legalityChecks || [],
                summary: comprehensiveAnalysis.reasoning,
                riskScenarios: comprehensiveAnalysis.combinedRiskScenarios.map(s => ({
                    title: s.title,
                    probability: s.probability,
                    severity: s.severity,
                    description: s.description,
                })),
            };
        } catch (err) {
            console.warn('Comprehensive analysis failed, falling back to basic audit:', err);
        }
    }

    // Fallback to basic audit
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
    const scheduledDate = new Date(flight.scheduledDateTime || flight.scheduledDate);

    if (!pilot || !aircraft) {
        throw new Error('Flight missing pilot or aircraft reference');
    }

    // 2. Fetch live weather (use enhanced weather service)
    let weather = flight.weather;
    try {
        const fetchedWeather = await fetchEnhancedWeatherData(flight.departureAirport);
        if (fetchedWeather) {
            weather = fetchedWeather;
        }
    } catch {
        console.warn('Weather fetch failed, using cached or defaults');
    }

    // 3. Run all checks
    const checks: ILegalityCheck[] = [];

    // Maintenance checks
    checks.push(checkAnnualInspection(aircraft, scheduledDate));
    checks.push(checkTransponder(aircraft, scheduledDate));
    checks.push(checkStaticSystem(aircraft, scheduledDate, pilot.certificates?.instrumentRated || false));
    checks.push(checkHundredHour(aircraft, scheduledDate, false)); // Assume not for-hire for demo

    // Pilot currency checks
    checks.push(checkMedical(pilot, scheduledDate));
    checks.push(checkFlightReview(pilot, scheduledDate));

    // Weather/safety checks
    if (weather) {
        const weatherChecks = checkWeatherVsPilot(
            weather.flightCategory,
            weather.wind,
            pilot
        );
        checks.push(...weatherChecks);
    }

    // 4. Calculate overall status
    const overallStatus = calculateOverallStatus(checks);
    const summary = generateSummary(checks, overallStatus);
    const riskScenarios = calculateRiskScenarios(aircraft, pilot, weather, scheduledDate);

    // 5. Update flight document
    flight.legalityChecks = checks;
    flight.overallStatus = overallStatus;
    if (weather) flight.weather = weather;

    // SAVE LEGACY SNAPSHOT for backwards compatibility
    flight.legacySafetySnapshot = {
        checks,
        overallStatus,
        weather,
        riskScenarios,
        generatedAt: new Date()
    };

    await flight.save();

    return {
        overallStatus,
        checks,
        summary,
        riskScenarios
    };
}

// ============================================
// RISK SCENARIO CALCULATION
// ============================================

function calculateRiskScenarios(aircraft: IAircraft, pilot: IPilot, weather: IWeatherData | undefined, scheduledDate: Date): IRiskScenario[] {
    const scenarios: IRiskScenario[] = [];
    const hour = scheduledDate.getHours();
    const isNightFlight = hour >= 19 || hour <= 6;
    const airframeHours = aircraft.currentHours.hobbs || 0;

    // Alternator
    const alternatorRisk = Math.min(Math.round((airframeHours % 500) / 500 * 15), 15);
    let alternatorSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (isNightFlight && alternatorRisk > 5) alternatorSeverity = 'high';
    if (isNightFlight && (pilot.experience?.nightHours || 0) < 20) alternatorSeverity = 'critical';

    scenarios.push({
        title: 'Electrical Failure',
        probability: alternatorRisk,
        severity: alternatorSeverity,
        description: isNightFlight
            ? `${alternatorRisk}% alternator failure risk. Night flight with ${pilot.experience?.nightHours || 0} night hours - NO LIGHTS/RADIOS would be catastrophic.`
            : `${alternatorRisk}% alternator failure risk. Daylight operations reduce severity.`
    });

    // Weather
    if (weather) {
        let wxRisk = 5;
        if (weather.flightCategory === 'MVFR') wxRisk = 20;
        if (weather.flightCategory === 'IFR') wxRisk = 40;
        if (weather.flightCategory === 'LIFR') wxRisk = 60;

        const isIRPilot = pilot.certificates.instrumentRated;
        let wxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';
        if (wxRisk >= 20 && !isIRPilot) wxSeverity = 'high';
        if (wxRisk >= 40 && !isIRPilot) wxSeverity = 'critical';

        scenarios.push({
            title: 'Weather Below Minimums',
            probability: wxRisk,
            severity: wxSeverity,
            description: !isIRPilot && wxRisk >= 20
                ? `${weather.flightCategory} conditions with VFR-only pilot. If weather worsens, pilot lacks instrument capability.`
                : `Current: ${weather.flightCategory}. Ceiling ${weather.ceiling ?? 'CLR'}, vis ${weather.visibility}SM.`
        });
    }

    // Pilot Experience & Proficiency
    const isStudent = pilot.certificates.type === 'Student';
    const totalHours = pilot.experience?.totalHours || 0;
    const last90Days = pilot.experience?.last90DaysHours || 0;

    // Proficiency Check (Last 90 days)
    if (last90Days < 3) {
        scenarios.push({
            title: 'Recent Proficiency Gap',
            probability: 30,
            severity: 'high',
            description: `Pilot has only ${last90Days} hours in last 90 days. High risk of skill degradation.`
        });
    } else if (last90Days < 6) {
        scenarios.push({
            title: 'Low Proficiency',
            probability: 15,
            severity: 'medium',
            description: `Pilot has ${last90Days} hours in last 90 days. Consider a practice flight.`
        });
    }

    // ============================================
    // AI SAFETY ANALYSIS INTEGRATION - PILOT
    // ============================================
    if (pilot.safetyAnalysis && pilot.safetyAnalysis.score > 5) {
        const aiScore = pilot.safetyAnalysis.score;

        // Extract specific high-risk findings from AI analysis
        const highRiskFindings = pilot.safetyAnalysis.findings?.filter(
            (f: any) => f.riskLevel === 'high'
        ) || [];

        const findingsSummary = highRiskFindings.length > 0
            ? ` Key concerns: ${highRiskFindings.map((f: any) => f.category).join(', ')}.`
            : '';

        scenarios.push({
            title: 'AI Pilot Risk Assessment',
            probability: Math.min(aiScore * 8, 80),
            severity: aiScore > 8 ? 'critical' : aiScore > 6 ? 'high' : 'medium',
            description: `Gemini Pro 3 analysis scores this pilot at ${aiScore}/10 risk level.${findingsSummary} Last analyzed: ${pilot.safetyAnalysis.lastAnalyzed ? new Date(pilot.safetyAnalysis.lastAnalyzed).toLocaleDateString() : 'Unknown'}.`
        });

        // If pilot has critical findings, add individual risk scenarios
        highRiskFindings.forEach((finding: any) => {
            scenarios.push({
                title: `Pilot: ${finding.category}`,
                probability: 40,
                severity: 'high',
                description: finding.message
            });
        });
    }

    // ============================================
    // AI SAFETY ANALYSIS INTEGRATION - AIRCRAFT
    // ============================================
    if (aircraft.safetyAnalysis && aircraft.safetyAnalysis.findings) {
        const criticalFindings = aircraft.safetyAnalysis.findings.filter(
            (f: any) => f.status === 'critical'
        );
        const warningFindings = aircraft.safetyAnalysis.findings.filter(
            (f: any) => f.status === 'warning'
        );

        // Add critical mechanical integrity scenarios
        if (criticalFindings.length > 0) {
            scenarios.push({
                title: 'Mechanical Integrity - Critical',
                probability: 60,
                severity: 'critical',
                description: `AI maintenance analysis detected ${criticalFindings.length} critical issue(s): ${criticalFindings.map((f: any) => f.component).join(', ')}. Aircraft may not be airworthy.`
            });

            criticalFindings.forEach((finding: any) => {
                scenarios.push({
                    title: `Component: ${finding.component}`,
                    probability: 50,
                    severity: 'critical',
                    description: finding.message
                });
            });
        }

        // Add warning-level mechanical scenarios
        if (warningFindings.length > 0) {
            scenarios.push({
                title: 'Mechanical Integrity - Caution',
                probability: 30,
                severity: 'high',
                description: `AI maintenance analysis flagged ${warningFindings.length} warning(s): ${warningFindings.map((f: any) => f.component).join(', ')}. Verify maintenance status.`
            });
        }

        // Add overall aircraft safety score if low
        if (aircraft.safetyAnalysis.score < 7) {
            scenarios.push({
                title: 'Low Aircraft Safety Score',
                probability: Math.round((10 - aircraft.safetyAnalysis.score) * 8),
                severity: aircraft.safetyAnalysis.score < 5 ? 'critical' : 'high',
                description: `Aircraft safety score is ${aircraft.safetyAnalysis.score}/10. Multiple maintenance items may require attention. Last analysis: ${new Date(aircraft.safetyAnalysis.lastAnalyzed).toLocaleDateString()}.`
            });
        }
    }

    if (isStudent || totalHours < 100) {
        const expRisk = isStudent ? 25 : Math.max(15 - totalHours / 10, 5);
        let expSeverity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
        if (isStudent && isNightFlight) expSeverity = 'critical';

        scenarios.push({
            title: 'Pilot Inexperience',
            probability: Math.round(expRisk),
            severity: expSeverity,
            description: isStudent
                ? `Student pilot with ${totalHours} total hours. ${isNightFlight ? 'NIGHT FLIGHT - requires endorsement.' : ''}`
                : `Low-time pilot (${totalHours} hrs). Consider additional pre-flight briefing.`
        });
    }

    // Engine
    const engineHours = airframeHours % 2000;
    const engineRisk = Math.min(Math.round(engineHours / 2000 * 10), 10);
    scenarios.push({
        title: 'Engine Failure',
        probability: engineRisk,
        severity: engineRisk > 5 ? 'medium' : 'low',
        description: `${engineRisk}% risk based on TBO position. ${engineHours.toFixed(0)} hrs since major overhaul.`
    });

    // ============================================
    // COMBINED AI RISK - HIGH-RISK PILOT + AIRCRAFT WARNINGS
    // ============================================
    const hasPilotRisk = pilot.safetyAnalysis && pilot.safetyAnalysis.score > 7;
    const hasAircraftRisk = aircraft.safetyAnalysis &&
        aircraft.safetyAnalysis.findings?.some((f: any) => f.status === 'warning' || f.status === 'critical');

    if (hasPilotRisk && hasAircraftRisk) {
        scenarios.push({
            title: 'Combined AI Risk Factor',
            probability: 70,
            severity: 'critical',
            description: `CRITICAL: Both pilot (score: ${pilot.safetyAnalysis?.score}/10) and aircraft have AI-flagged concerns. This combination significantly elevates mission risk. Consider alternative crew/aircraft pairing.`
        });
    }

    return scenarios.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
    });
}
