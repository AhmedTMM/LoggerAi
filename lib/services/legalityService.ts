// Legality Service - Core compliance engine for flight audits
// Determines Go/Caution/No-Go based on FAA regulations (Title 14 CFR)
// Now integrates with comprehensive safety analysis for enhanced auditing

import Flight, { IFlight, ILegalityCheck, IWeatherData } from '@/lib/models/Flight';
import { IAircraft } from '@/lib/models/Aircraft';
import { IPilot } from '@/lib/models/Pilot';
import { fetchWeatherData, fetchEnhancedWeatherData, fetchRouteWeather } from './weatherService';
import { runComprehensiveSafetyAnalysis } from './comprehensiveSafetyService';
import { MS_PER_DAY } from './documentProcessingUtils';
import { REGULATION_REFS } from '@/lib/faaRegulations';

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
// MAINTENANCE CHECKS (14 CFR Part 91 Subpart E)
// ============================================

function checkAnnualInspection(aircraft: IAircraft, asOf: Date): ILegalityCheck {
    const annualDate = new Date(aircraft.maintenanceDates.annual);
    const oneYearLater = new Date(annualDate);
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    const isOverdue = asOf > oneYearLater;
    const daysUntilDue = Math.floor((oneYearLater.getTime() - asOf.getTime()) / MS_PER_DAY);

    if (isOverdue) {
        return {
            category: 'maintenance',
            item: 'Annual Inspection',
            status: 'fail',
            message: `Annual overdue by ${Math.abs(daysUntilDue)} days - aircraft NOT airworthy`,
            details: `Last annual: ${annualDate.toLocaleDateString()}. Per ${REGULATION_REFS.ANNUAL_INSPECTION}, aircraft must have annual inspection within preceding 12 calendar months.`,
            regulatoryReference: REGULATION_REFS.ANNUAL_INSPECTION,
        };
    }

    if (daysUntilDue <= 30) {
        return {
            category: 'maintenance',
            item: 'Annual Inspection',
            status: 'warning',
            message: `Annual due in ${daysUntilDue} days`,
            details: `Due by: ${oneYearLater.toLocaleDateString()}`,
            regulatoryReference: REGULATION_REFS.ANNUAL_INSPECTION,
        };
    }

    return {
        category: 'maintenance',
        item: 'Annual Inspection',
        status: 'pass',
        message: `Annual valid until ${oneYearLater.toLocaleDateString()}`,
        regulatoryReference: REGULATION_REFS.ANNUAL_INSPECTION,
    };
}

function checkTransponder(aircraft: IAircraft, asOf: Date): ILegalityCheck {
    const transponderDate = new Date(aircraft.maintenanceDates.transponder);
    const twoYearsLater = new Date(transponderDate);
    twoYearsLater.setMonth(twoYearsLater.getMonth() + 24);

    const isOverdue = asOf > twoYearsLater;
    const daysUntilDue = Math.floor((twoYearsLater.getTime() - asOf.getTime()) / MS_PER_DAY);

    if (isOverdue) {
        return {
            category: 'maintenance',
            item: 'Transponder Check',
            status: 'fail',
            message: `Transponder check overdue by ${Math.abs(daysUntilDue)} days`,
            details: `Last check: ${transponderDate.toLocaleDateString()}. Per ${REGULATION_REFS.TRANSPONDER_CHECK}, transponder must be tested within preceding 24 calendar months.`,
            regulatoryReference: REGULATION_REFS.TRANSPONDER_CHECK,
        };
    }

    if (daysUntilDue <= 60) {
        return {
            category: 'maintenance',
            item: 'Transponder Check',
            status: 'warning',
            message: `Transponder due in ${daysUntilDue} days`,
            regulatoryReference: REGULATION_REFS.TRANSPONDER_CHECK,
        };
    }

    return {
        category: 'maintenance',
        item: 'Transponder Check',
        status: 'pass',
        message: `Transponder valid until ${twoYearsLater.toLocaleDateString()}`,
        regulatoryReference: REGULATION_REFS.TRANSPONDER_CHECK,
    };
}

function checkStaticSystem(aircraft: IAircraft, asOf: Date, isIFR: boolean): ILegalityCheck {
    if (!isIFR) {
        return {
            category: 'maintenance',
            item: 'Altimeter/Static System (IFR)',
            status: 'pass',
            message: 'N/A for VFR flight',
            regulatoryReference: REGULATION_REFS.ALTIMETER_STATIC_CHECK,
        };
    }

    const staticDate = new Date(aircraft.maintenanceDates.staticSystem);
    const twoYearsLater = new Date(staticDate);
    twoYearsLater.setMonth(twoYearsLater.getMonth() + 24);

    const isOverdue = asOf > twoYearsLater;
    const daysUntilDue = Math.floor((twoYearsLater.getTime() - asOf.getTime()) / MS_PER_DAY);

    if (isOverdue) {
        return {
            category: 'maintenance',
            item: 'Altimeter/Static System (IFR)',
            status: 'fail',
            message: `Altimeter/static system check overdue for IFR operations`,
            details: `Last check: ${staticDate.toLocaleDateString()}. Per ${REGULATION_REFS.ALTIMETER_STATIC_CHECK}, altimeter and static system must be tested within preceding 24 calendar months for IFR in controlled airspace.`,
            regulatoryReference: REGULATION_REFS.ALTIMETER_STATIC_CHECK,
        };
    }

    if (daysUntilDue <= 60) {
        return {
            category: 'maintenance',
            item: 'Altimeter/Static System (IFR)',
            status: 'warning',
            message: `Altimeter/static check due in ${daysUntilDue} days`,
            regulatoryReference: REGULATION_REFS.ALTIMETER_STATIC_CHECK,
        };
    }

    return {
        category: 'maintenance',
        item: 'Altimeter/Static System (IFR)',
        status: 'pass',
        message: `Altimeter/static valid until ${twoYearsLater.toLocaleDateString()}`,
        regulatoryReference: REGULATION_REFS.ALTIMETER_STATIC_CHECK,
    };
}

function checkHundredHour(aircraft: IAircraft, asOf: Date, isForHire: boolean): ILegalityCheck {
    if (!isForHire || !aircraft.maintenanceDates.hundredHour) {
        return {
            category: 'maintenance',
            item: '100-Hour Inspection',
            status: 'pass',
            message: 'N/A (not for-hire or flight instruction for hire)',
            regulatoryReference: REGULATION_REFS.HUNDRED_HOUR_INSPECTION,
        };
    }

    // Find last 100-hour from logs or maintenanceDates
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
            details: `Current tach: ${currentTach}, Last 100-hr at: ${lastTachAtHundred}. Per ${REGULATION_REFS.HUNDRED_HOUR_INSPECTION}, required for aircraft used for hire. 10-hour overfly allowed to reach inspection facility.`,
            regulatoryReference: REGULATION_REFS.HUNDRED_HOUR_INSPECTION,
        };
    }

    if (hoursSince >= 90) {
        return {
            category: 'maintenance',
            item: '100-Hour Inspection',
            status: 'warning',
            message: `100-hour due in ${(100 - hoursSince).toFixed(1)} hours`,
            regulatoryReference: REGULATION_REFS.HUNDRED_HOUR_INSPECTION,
        };
    }

    return {
        category: 'maintenance',
        item: '100-Hour Inspection',
        status: 'pass',
        message: `100-hour not due for ${(100 - hoursSince).toFixed(1)} more hours`,
        regulatoryReference: REGULATION_REFS.HUNDRED_HOUR_INSPECTION,
    };
}

// ELT Check (14 CFR 91.207)
function checkELT(aircraft: IAircraft, asOf: Date): ILegalityCheck {
    const eltDate = aircraft.airworthinessStatus?.elt;
    if (!eltDate) {
        return {
            category: 'maintenance',
            item: 'ELT Inspection',
            status: 'warning',
            message: 'ELT inspection date not recorded',
            details: `Per ${REGULATION_REFS.ELT_INSPECTION}, ELT must be inspected within 12 calendar months for proper installation, battery corrosion, operation of controls and crash sensor.`,
            regulatoryReference: REGULATION_REFS.ELT_INSPECTION,
        };
    }

    const eltInspDate = new Date(eltDate);
    const oneYearLater = new Date(eltInspDate);
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    const isOverdue = asOf > oneYearLater;
    const daysUntilDue = Math.floor((oneYearLater.getTime() - asOf.getTime()) / MS_PER_DAY);

    // Also check battery expiration if available
    const batteryExp = aircraft.airworthinessStatus?.eltBatteryExpiration;
    let batteryWarning = '';
    if (batteryExp) {
        const battExpDate = new Date(batteryExp);
        if (asOf > battExpDate) {
            batteryWarning = ` ELT battery EXPIRED on ${battExpDate.toLocaleDateString()}.`;
        }
    }

    if (isOverdue || batteryWarning.includes('EXPIRED')) {
        return {
            category: 'maintenance',
            item: 'ELT Inspection',
            status: 'fail',
            message: isOverdue
                ? `ELT inspection overdue by ${Math.abs(daysUntilDue)} days.${batteryWarning}`
                : `ELT battery expired.${batteryWarning}`,
            details: `Last inspection: ${eltInspDate.toLocaleDateString()}. Replace battery when 50% useful life expired or after 1 hour cumulative use.`,
            regulatoryReference: REGULATION_REFS.ELT_INSPECTION,
        };
    }

    if (daysUntilDue <= 30) {
        return {
            category: 'maintenance',
            item: 'ELT Inspection',
            status: 'warning',
            message: `ELT inspection due in ${daysUntilDue} days`,
            regulatoryReference: REGULATION_REFS.ELT_INSPECTION,
        };
    }

    return {
        category: 'maintenance',
        item: 'ELT Inspection',
        status: 'pass',
        message: `ELT inspection valid until ${oneYearLater.toLocaleDateString()}`,
        regulatoryReference: REGULATION_REFS.ELT_INSPECTION,
    };
}

// VOR Check (14 CFR 91.171) - Required for IFR operations
function checkVOR(aircraft: IAircraft, asOf: Date, isIFR: boolean): ILegalityCheck {
    if (!isIFR) {
        return {
            category: 'maintenance',
            item: 'VOR Check (IFR)',
            status: 'pass',
            message: 'N/A for VFR flight',
            regulatoryReference: REGULATION_REFS.VOR_CHECK,
        };
    }

    const vorDate = aircraft.airworthinessStatus?.vor;
    if (!vorDate) {
        return {
            category: 'compliance',
            item: 'VOR Check (IFR)',
            status: 'warning',
            message: 'VOR check date not recorded - required within 30 days for IFR',
            details: `Per ${REGULATION_REFS.VOR_CHECK}, VOR equipment must be operationally checked within preceding 30 days for IFR operations. Acceptable methods: VOT (+/-4°), ground checkpoint (+/-4°), airborne checkpoint (+/-6°), dual VOR cross-check (within 4° of each other).`,
            regulatoryReference: REGULATION_REFS.VOR_CHECK,
        };
    }

    const vorCheckDate = new Date(vorDate);
    const thirtyDaysLater = new Date(vorCheckDate);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    const isOverdue = asOf > thirtyDaysLater;
    const daysUntilDue = Math.floor((thirtyDaysLater.getTime() - asOf.getTime()) / MS_PER_DAY);

    if (isOverdue) {
        return {
            category: 'compliance',
            item: 'VOR Check (IFR)',
            status: 'fail',
            message: `VOR check overdue by ${Math.abs(daysUntilDue)} days - IFR not legal`,
            details: `Last check: ${vorCheckDate.toLocaleDateString()}. Per ${REGULATION_REFS.VOR_CHECK}, must be checked within preceding 30 days.`,
            regulatoryReference: REGULATION_REFS.VOR_CHECK,
        };
    }

    if (daysUntilDue <= 7) {
        return {
            category: 'compliance',
            item: 'VOR Check (IFR)',
            status: 'warning',
            message: `VOR check due in ${daysUntilDue} days`,
            regulatoryReference: REGULATION_REFS.VOR_CHECK,
        };
    }

    return {
        category: 'compliance',
        item: 'VOR Check (IFR)',
        status: 'pass',
        message: `VOR check valid until ${thirtyDaysLater.toLocaleDateString()}`,
        regulatoryReference: REGULATION_REFS.VOR_CHECK,
    };
}

// ============================================
// PILOT CURRENCY CHECKS (14 CFR Part 61)
// ============================================

function checkMedical(pilot: IPilot, asOf: Date): ILegalityCheck {
    const medicalExp = new Date(pilot.medicalExpiration);
    const isExpired = asOf > medicalExp;
    const daysUntilExp = Math.floor((medicalExp.getTime() - asOf.getTime()) / MS_PER_DAY);
    const medicalClass = pilot.medicalClass || '3rd';

    if (isExpired) {
        // Check BasicMed as alternative
        if (pilot.basicMed?.enabled && pilot.basicMed.lastPhysicalExam) {
            const physExam = new Date(pilot.basicMed.lastPhysicalExam);
            const physExamValid = new Date(physExam);
            physExamValid.setMonth(physExamValid.getMonth() + 48);
            if (asOf <= physExamValid) {
                return {
                    category: 'pilot',
                    item: 'Medical Certificate (BasicMed)',
                    status: 'pass',
                    message: `Traditional medical expired but BasicMed valid. Physical exam valid until ${physExamValid.toLocaleDateString()}`,
                    details: `BasicMed per ${REGULATION_REFS.MEDICAL_CERTIFICATE}(c)(3). Limitations: max 6 seats, max 6,000 lbs, below FL180, max 250 KIAS, US operations only.`,
                    regulatoryReference: REGULATION_REFS.MEDICAL_CERTIFICATE,
                };
            }
        }

        return {
            category: 'pilot',
            item: 'Medical Certificate',
            status: 'fail',
            message: `${medicalClass}-class medical expired on ${medicalExp.toLocaleDateString()} - pilot NOT legal to act as PIC`,
            details: `Per ${REGULATION_REFS.MEDICAL_CERTIFICATE}, duration varies by class and age. Consider BasicMed if eligible.`,
            regulatoryReference: REGULATION_REFS.MEDICAL_CERTIFICATE,
        };
    }

    if (daysUntilExp <= 30) {
        return {
            category: 'pilot',
            item: 'Medical Certificate',
            status: 'warning',
            message: `${medicalClass}-class medical expires in ${daysUntilExp} days`,
            details: `Expires: ${medicalExp.toLocaleDateString()}. Schedule AME visit promptly.`,
            regulatoryReference: REGULATION_REFS.MEDICAL_CERTIFICATE,
        };
    }

    return {
        category: 'pilot',
        item: 'Medical Certificate',
        status: 'pass',
        message: `${medicalClass}-class medical valid until ${medicalExp.toLocaleDateString()}`,
        regulatoryReference: REGULATION_REFS.MEDICAL_CERTIFICATE,
    };
}

function checkFlightReview(pilot: IPilot, asOf: Date): ILegalityCheck {
    const bfrExp = new Date(pilot.flightReviewExpiration);
    const isExpired = asOf > bfrExp;
    const daysUntilExp = Math.floor((bfrExp.getTime() - asOf.getTime()) / MS_PER_DAY);

    // Check WINGS program as alternative
    if (isExpired && pilot.wingsPhaseCompleted?.completedDate) {
        const wingsDate = new Date(pilot.wingsPhaseCompleted.completedDate);
        const wingsValid = new Date(wingsDate);
        wingsValid.setMonth(wingsValid.getMonth() + 24);
        if (asOf <= wingsValid) {
            return {
                category: 'pilot',
                item: 'Flight Review',
                status: 'pass',
                message: `WINGS Phase ${pilot.wingsPhaseCompleted.phase} completed ${wingsDate.toLocaleDateString()} - satisfies flight review`,
                details: `Per ${REGULATION_REFS.FLIGHT_REVIEW}, WINGS program completion is an acceptable alternative to biennial flight review.`,
                regulatoryReference: REGULATION_REFS.FLIGHT_REVIEW,
            };
        }
    }

    if (isExpired) {
        return {
            category: 'pilot',
            item: 'Flight Review',
            status: 'fail',
            message: `Flight review expired on ${bfrExp.toLocaleDateString()} - pilot NOT legal to act as PIC`,
            details: `Per ${REGULATION_REFS.FLIGHT_REVIEW}, requires 1 hour flight + 1 hour ground training with CFI reviewing Part 91 rules and safe-flight maneuvers within 24 calendar months. Alternatives: proficiency check, WINGS program completion, Part 121/135 PIC check.`,
            regulatoryReference: REGULATION_REFS.FLIGHT_REVIEW,
        };
    }

    if (daysUntilExp <= 30) {
        return {
            category: 'pilot',
            item: 'Flight Review',
            status: 'warning',
            message: `Flight review expires in ${daysUntilExp} days`,
            details: `Due by: ${bfrExp.toLocaleDateString()}`,
            regulatoryReference: REGULATION_REFS.FLIGHT_REVIEW,
        };
    }

    return {
        category: 'pilot',
        item: 'Flight Review',
        status: 'pass',
        message: `Flight review valid until ${bfrExp.toLocaleDateString()}`,
        regulatoryReference: REGULATION_REFS.FLIGHT_REVIEW,
    };
}

// Day Landing Currency (14 CFR 61.57(a))
function checkDayLandingCurrency(pilot: IPilot): ILegalityCheck {
    const currency = pilot.experience?.landingCurrency;
    if (!currency) {
        return {
            category: 'pilot',
            item: 'Day Landing Currency',
            status: 'warning',
            message: 'Landing currency data not recorded',
            details: `Per ${REGULATION_REFS.DAY_LANDING_CURRENCY}, to carry passengers the pilot must have made 3 takeoffs and landings within the preceding 90 days in the same category, class, and type (if type rating required).`,
            regulatoryReference: REGULATION_REFS.DAY_LANDING_CURRENCY,
        };
    }

    if (currency.dayLandingsLast90Days < 3) {
        return {
            category: 'pilot',
            item: 'Day Landing Currency',
            status: 'fail',
            message: `Only ${currency.dayLandingsLast90Days} day landings in last 90 days (3 required to carry passengers)`,
            details: `Per ${REGULATION_REFS.DAY_LANDING_CURRENCY}, 3 takeoffs/landings required in preceding 90 days for the same category and class. Solo flight is still legal.`,
            regulatoryReference: REGULATION_REFS.DAY_LANDING_CURRENCY,
        };
    }

    return {
        category: 'pilot',
        item: 'Day Landing Currency',
        status: 'pass',
        message: `${currency.dayLandingsLast90Days} day landings in last 90 days (3 required)`,
        regulatoryReference: REGULATION_REFS.DAY_LANDING_CURRENCY,
    };
}

// Night Landing Currency (14 CFR 61.57(b))
function checkNightLandingCurrency(pilot: IPilot, isNightFlight: boolean): ILegalityCheck {
    if (!isNightFlight) {
        return {
            category: 'pilot',
            item: 'Night Landing Currency',
            status: 'pass',
            message: 'N/A for day flight',
            regulatoryReference: REGULATION_REFS.NIGHT_LANDING_CURRENCY,
        };
    }

    const currency = pilot.experience?.landingCurrency;
    if (!currency) {
        return {
            category: 'pilot',
            item: 'Night Landing Currency',
            status: 'warning',
            message: 'Night landing currency data not recorded',
            details: `Per ${REGULATION_REFS.NIGHT_LANDING_CURRENCY}, to carry passengers at night (1 hour after sunset to 1 hour before sunrise), the pilot must have made 3 takeoffs and 3 full-stop landings at night within the preceding 90 days.`,
            regulatoryReference: REGULATION_REFS.NIGHT_LANDING_CURRENCY,
        };
    }

    if (currency.nightLandingsLast90Days < 3) {
        return {
            category: 'pilot',
            item: 'Night Landing Currency',
            status: 'fail',
            message: `Only ${currency.nightLandingsLast90Days} night full-stop landings in last 90 days (3 required for night pax)`,
            details: `Per ${REGULATION_REFS.NIGHT_LANDING_CURRENCY}, 3 takeoffs and full-stop landings during the period from 1 hour after sunset to 1 hour before sunrise within 90 days.`,
            regulatoryReference: REGULATION_REFS.NIGHT_LANDING_CURRENCY,
        };
    }

    return {
        category: 'pilot',
        item: 'Night Landing Currency',
        status: 'pass',
        message: `${currency.nightLandingsLast90Days} night landings in last 90 days (3 required)`,
        regulatoryReference: REGULATION_REFS.NIGHT_LANDING_CURRENCY,
    };
}

// IFR Currency (14 CFR 61.57(c))
function checkIFRCurrency(pilot: IPilot, isIFR: boolean): ILegalityCheck {
    if (!isIFR) {
        return {
            category: 'pilot',
            item: 'IFR Currency',
            status: 'pass',
            message: 'N/A for VFR flight',
            regulatoryReference: REGULATION_REFS.IFR_CURRENCY,
        };
    }

    if (!pilot.certificates?.instrumentRated) {
        return {
            category: 'pilot',
            item: 'IFR Currency',
            status: 'fail',
            message: 'Pilot does not hold instrument rating - IFR flight not legal',
            regulatoryReference: REGULATION_REFS.IFR_CURRENCY,
        };
    }

    const ifrCurrency = pilot.experience?.ifrCurrency;
    if (!ifrCurrency) {
        return {
            category: 'pilot',
            item: 'IFR Currency',
            status: 'warning',
            message: 'IFR currency data not recorded',
            details: `Per ${REGULATION_REFS.IFR_CURRENCY}, within preceding 6 calendar months: 6 instrument approaches, holding procedures, and intercepting/tracking courses. 6-month grace period with IPC required after.`,
            regulatoryReference: REGULATION_REFS.IFR_CURRENCY,
        };
    }

    // Check IPC first - if recent IPC, pilot is current
    if (ifrCurrency.ipcDate) {
        const ipcDate = new Date(ifrCurrency.ipcDate);
        const sixMonths = new Date(ipcDate);
        sixMonths.setMonth(sixMonths.getMonth() + 6);
        if (new Date() <= sixMonths) {
            return {
                category: 'pilot',
                item: 'IFR Currency',
                status: 'pass',
                message: `IPC completed ${ipcDate.toLocaleDateString()} - IFR current`,
                regulatoryReference: REGULATION_REFS.IFR_CURRENCY,
            };
        }
    }

    const hasApproaches = ifrCurrency.approachesLast6Months >= 6;
    const hasHolding = ifrCurrency.holdingLast6Months;
    const hasTracking = ifrCurrency.interceptingTrackingLast6Months;
    const isIFRCurrent = hasApproaches && hasHolding && hasTracking;

    if (!isIFRCurrent) {
        const missing: string[] = [];
        if (!hasApproaches) missing.push(`approaches (${ifrCurrency.approachesLast6Months}/6)`);
        if (!hasHolding) missing.push('holding procedures');
        if (!hasTracking) missing.push('intercepting/tracking');

        return {
            category: 'pilot',
            item: 'IFR Currency',
            status: 'fail',
            message: `IFR currency lapsed - missing: ${missing.join(', ')}`,
            details: `Per ${REGULATION_REFS.IFR_CURRENCY}: within 6 months need 6 approaches, holding, and intercepting/tracking. If within grace period (6-12 months), an Instrument Proficiency Check (IPC) with CFII or examiner is required.`,
            regulatoryReference: REGULATION_REFS.IFR_CURRENCY,
        };
    }

    return {
        category: 'pilot',
        item: 'IFR Currency',
        status: 'pass',
        message: `IFR current: ${ifrCurrency.approachesLast6Months} approaches, holding, and tracking complete`,
        regulatoryReference: REGULATION_REFS.IFR_CURRENCY,
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
            details: `Pilot ${pilot.name} is VFR-only. Per ${REGULATION_REFS.VFR_MINIMUMS}, VFR flight requires basic VFR weather minimums.`,
            regulatoryReference: REGULATION_REFS.VFR_MINIMUMS,
        });
    } else if (flightCategory === 'MVFR' && (pilot.experience?.totalHours || 0) < 100) {
        checks.push({
            category: 'safety',
            item: 'Weather vs. Experience',
            status: 'warning',
            message: 'MVFR conditions not recommended for low-time pilots',
            details: `Pilot has ${pilot.experience?.totalHours || 0} total hours. Marginal VFR conditions increase risk of inadvertent IMC.`,
            regulatoryReference: REGULATION_REFS.VFR_MINIMUMS,
        });
    } else {
        checks.push({
            category: 'safety',
            item: 'Weather vs. Ratings',
            status: 'pass',
            message: `${flightCategory} conditions OK for pilot qualifications`,
            regulatoryReference: REGULATION_REFS.VFR_MINIMUMS,
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
        return '✅ All systems GO. Flight is legal and safe to operate per 14 CFR Part 91.';
    }

    let summary = overallStatus === 'no-go' ? '🛑 FLIGHT GROUNDED\n\n' : '⚠️ FLIGHT CAUTION\n\n';

    if (failedChecks.length > 0) {
        summary += 'Regulatory Violations:\n';
        failedChecks.forEach(c => {
            summary += `• ${c.item}: ${c.message}`;
            if (c.regulatoryReference) summary += ` [${c.regulatoryReference}]`;
            summary += '\n';
        });
        summary += '\n';
    }

    if (warnings.length > 0) {
        summary += 'Warnings:\n';
        warnings.forEach(c => {
            summary += `• ${c.item}: ${c.message}`;
            if (c.regulatoryReference) summary += ` [${c.regulatoryReference}]`;
            summary += '\n';
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

    // Determine flight conditions
    const isIFR = pilot.certificates?.instrumentRated || false;
    const hour = scheduledDate.getHours();
    const isNightFlight = hour >= 19 || hour <= 6;
    const isForHire = aircraft.airworthinessStatus?.isForHire || false;

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

    // === Aircraft Maintenance Checks (14 CFR Part 91 Subpart E) ===
    checks.push(checkAnnualInspection(aircraft, scheduledDate));
    checks.push(checkTransponder(aircraft, scheduledDate));
    checks.push(checkStaticSystem(aircraft, scheduledDate, isIFR));
    checks.push(checkHundredHour(aircraft, scheduledDate, isForHire));
    checks.push(checkELT(aircraft, scheduledDate));
    checks.push(checkVOR(aircraft, scheduledDate, isIFR));

    // === Pilot Currency Checks (14 CFR Part 61) ===
    checks.push(checkMedical(pilot, scheduledDate));
    checks.push(checkFlightReview(pilot, scheduledDate));
    checks.push(checkDayLandingCurrency(pilot));
    checks.push(checkNightLandingCurrency(pilot, isNightFlight));
    checks.push(checkIFRCurrency(pilot, isIFR));

    // === Weather/Safety Checks ===
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
            ? `${alternatorRisk}% alternator failure risk. Night flight with ${pilot.experience?.nightHours || 0} night hours - NO LIGHTS/RADIOS would be catastrophic. Ref: 14 CFR 91.205(c) requires source of electrical energy for night flight.`
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
                ? `${weather.flightCategory} conditions with VFR-only pilot. Per 14 CFR 91.155, VFR requires basic weather minimums. Inadvertent IMC is a leading cause of GA fatalities.`
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
            description: `Pilot has only ${last90Days} hours in last 90 days. High risk of skill degradation. Consider refresher with CFI before PIC operations.`
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
            description: `AI analysis scores this pilot at ${aiScore}/10 risk level.${findingsSummary} Last analyzed: ${pilot.safetyAnalysis.lastAnalyzed ? new Date(pilot.safetyAnalysis.lastAnalyzed).toLocaleDateString() : 'Unknown'}.`
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
                description: `AI maintenance analysis detected ${criticalFindings.length} critical issue(s): ${criticalFindings.map((f: any) => f.component).join(', ')}. Aircraft may not be airworthy per ${REGULATION_REFS.MAINTENANCE_RESPONSIBILITY}.`
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
                description: `AI maintenance analysis flagged ${warningFindings.length} warning(s): ${warningFindings.map((f: any) => f.component).join(', ')}. Verify maintenance status per ${REGULATION_REFS.MAINTENANCE_RESPONSIBILITY}.`
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
                ? `Student pilot with ${totalHours} total hours. ${isNightFlight ? 'NIGHT FLIGHT - student pilot night operations per 14 CFR 61.89 restrictions.' : ''}`
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
