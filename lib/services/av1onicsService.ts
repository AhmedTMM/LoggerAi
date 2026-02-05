/**
 * AV1ONICS Maintenance Audit Service
 *
 * Implements comprehensive airworthiness checking per FAR requirements:
 * A - Annual (12 calendar months) - FAR 91.409
 * V - VOR (30 days for IFR) - FAR 91.171
 * 1 - 100-hour (if for hire) - FAR 91.409(b)
 * O - (Altimeter) - FAR 91.411 (24 calendar months for IFR)
 * N - (Transponder) - FAR 91.413 (24 calendar months)
 * I - (ELT) - FAR 91.207 (12 calendar months / half battery life)
 * C - (Compass) - Swing check (recommended, not regulatory)
 * S - Static System - FAR 91.411 (24 calendar months for IFR)
 *
 * Also handles MEL/KOEL compliance checking
 */

import { IAircraft, IAirworthinessStatus, IMELItem } from '@/lib/models/Aircraft';
import { MS_PER_DAY } from './documentProcessingUtils';

// Inspection status types
export type InspectionStatus = 'current' | 'due_soon' | 'overdue' | 'na';
export type AirworthinessResult = 'airworthy' | 'conditional' | 'grounded';

// Individual inspection check result
export interface IInspectionCheck {
  name: string;
  code: string; // A, V, 1, O, N, I, C, S
  regulatoryReference: string;
  lastCompleted?: Date;
  dueDate?: Date;
  status: InspectionStatus;
  daysRemaining?: number;
  hoursRemaining?: number; // For 100-hour
  message: string;
  isRequired: boolean;
  severity: 'ok' | 'warning' | 'critical';
}

// MEL/KOEL check result
export interface IMELCheck {
  requiresMEL: boolean;
  melUploaded: boolean;
  koelApplicable: boolean;
  koelUploaded: boolean;
  inoperativeItems: IMELItem[];
  deferredItems: IMELItem[];
  status: 'compliant' | 'warning' | 'non_compliant';
  message: string;
}

// Complete AV1ONICS audit result
export interface IAV1ONICSAudit {
  aircraftId: string;
  tailNumber: string;
  auditDate: Date;

  // Overall status
  overallStatus: AirworthinessResult;
  overallScore: number; // 1-100

  // Individual checks (AV1ONICS)
  checks: {
    annual: IInspectionCheck;       // A
    vor: IInspectionCheck;          // V
    hundredHour: IInspectionCheck;  // 1
    altimeter: IInspectionCheck;    // O (part of pitot-static)
    transponder: IInspectionCheck;  // N
    elt: IInspectionCheck;          // I
    compass: IInspectionCheck;      // C
    staticSystem: IInspectionCheck; // S
  };

  // MEL/KOEL status
  melCheck: IMELCheck;

  // Summary
  criticalIssues: string[];
  warnings: string[];
  recommendations: string[];
}

// Configuration for what checks are required
interface IAuditConfig {
  isIFRFlight: boolean;
  isForHire: boolean;
  requiresTransponder: boolean; // Mode C/S required airspace
}

// Default config for typical Part 91 VFR operations
const DEFAULT_CONFIG: IAuditConfig = {
  isIFRFlight: false,
  isForHire: false,
  requiresTransponder: true, // Assume Mode C veil operations
};

/**
 * Calculate days between two dates
 */
function daysBetween(date1: Date, date2: Date): number {
  const diffTime = date2.getTime() - date1.getTime();
  return Math.floor(diffTime / MS_PER_DAY);
}

/**
 * Add calendar months to a date (end of month handling for FAA calendar month rules)
 */
function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  // FAA calendar month rule: if the date is the 15th, add 12 months, it's the last day of that month
  // The inspection is due by the END of the calendar month
  result.setMonth(result.getMonth() + 1);
  result.setDate(0); // Last day of the previous month (our target month)
  return result;
}

/**
 * Check Annual Inspection (FAR 91.409)
 * Required: Every 12 calendar months
 */
function checkAnnual(aircraft: IAircraft, asOfDate: Date): IInspectionCheck {
  const lastAnnual = aircraft.airworthinessStatus?.annual || aircraft.maintenanceDates?.annual;

  if (!lastAnnual) {
    return {
      name: 'Annual Inspection',
      code: 'A',
      regulatoryReference: 'FAR 91.409(a)',
      status: 'overdue',
      message: 'Annual inspection date unknown - aircraft may not be airworthy',
      isRequired: true,
      severity: 'critical',
    };
  }

  const dueDate = addCalendarMonths(new Date(lastAnnual), 12);
  const daysRemaining = daysBetween(asOfDate, dueDate);

  if (daysRemaining < 0) {
    return {
      name: 'Annual Inspection',
      code: 'A',
      regulatoryReference: 'FAR 91.409(a)',
      lastCompleted: new Date(lastAnnual),
      dueDate,
      status: 'overdue',
      daysRemaining,
      message: `Annual OVERDUE by ${Math.abs(daysRemaining)} days - AIRCRAFT NOT AIRWORTHY`,
      isRequired: true,
      severity: 'critical',
    };
  }

  if (daysRemaining <= 30) {
    return {
      name: 'Annual Inspection',
      code: 'A',
      regulatoryReference: 'FAR 91.409(a)',
      lastCompleted: new Date(lastAnnual),
      dueDate,
      status: 'due_soon',
      daysRemaining,
      message: `Annual due in ${daysRemaining} days (${dueDate.toLocaleDateString()})`,
      isRequired: true,
      severity: 'warning',
    };
  }

  return {
    name: 'Annual Inspection',
    code: 'A',
    regulatoryReference: 'FAR 91.409(a)',
    lastCompleted: new Date(lastAnnual),
    dueDate,
    status: 'current',
    daysRemaining,
    message: `Annual current until ${dueDate.toLocaleDateString()}`,
    isRequired: true,
    severity: 'ok',
  };
}

/**
 * Check VOR Accuracy (FAR 91.171)
 * Required: Every 30 days for IFR operations
 */
function checkVOR(aircraft: IAircraft, asOfDate: Date, config: IAuditConfig): IInspectionCheck {
  if (!config.isIFRFlight) {
    return {
      name: 'VOR Accuracy Check',
      code: 'V',
      regulatoryReference: 'FAR 91.171',
      status: 'na',
      message: 'VOR check not required for VFR operations',
      isRequired: false,
      severity: 'ok',
    };
  }

  const lastVOR = aircraft.airworthinessStatus?.vor;

  if (!lastVOR) {
    return {
      name: 'VOR Accuracy Check',
      code: 'V',
      regulatoryReference: 'FAR 91.171',
      status: 'overdue',
      message: 'VOR check required for IFR - no record found',
      isRequired: true,
      severity: 'critical',
    };
  }

  const dueDate = new Date(lastVOR);
  dueDate.setDate(dueDate.getDate() + 30);
  const daysRemaining = daysBetween(asOfDate, dueDate);

  if (daysRemaining < 0) {
    return {
      name: 'VOR Accuracy Check',
      code: 'V',
      regulatoryReference: 'FAR 91.171',
      lastCompleted: new Date(lastVOR),
      dueDate,
      status: 'overdue',
      daysRemaining,
      message: `VOR check OVERDUE by ${Math.abs(daysRemaining)} days - ILLEGAL FOR IFR`,
      isRequired: true,
      severity: 'critical',
    };
  }

  if (daysRemaining <= 7) {
    return {
      name: 'VOR Accuracy Check',
      code: 'V',
      regulatoryReference: 'FAR 91.171',
      lastCompleted: new Date(lastVOR),
      dueDate,
      status: 'due_soon',
      daysRemaining,
      message: `VOR check due in ${daysRemaining} days for continued IFR operations`,
      isRequired: true,
      severity: 'warning',
    };
  }

  return {
    name: 'VOR Accuracy Check',
    code: 'V',
    regulatoryReference: 'FAR 91.171',
    lastCompleted: new Date(lastVOR),
    dueDate,
    status: 'current',
    daysRemaining,
    message: `VOR check current for IFR until ${dueDate.toLocaleDateString()}`,
    isRequired: true,
    severity: 'ok',
  };
}

/**
 * Check 100-Hour Inspection (FAR 91.409(b))
 * Required: If used for hire or flight instruction for hire
 */
function check100Hour(aircraft: IAircraft, asOfDate: Date, config: IAuditConfig): IInspectionCheck {
  if (!config.isForHire && !aircraft.airworthinessStatus?.isForHire) {
    return {
      name: '100-Hour Inspection',
      code: '1',
      regulatoryReference: 'FAR 91.409(b)',
      status: 'na',
      message: 'Not required - aircraft not used for hire',
      isRequired: false,
      severity: 'ok',
    };
  }

  const lastHundredHour = aircraft.airworthinessStatus?.hundredHour || aircraft.maintenanceDates?.hundredHour;

  if (!lastHundredHour) {
    return {
      name: '100-Hour Inspection',
      code: '1',
      regulatoryReference: 'FAR 91.409(b)',
      status: 'overdue',
      message: '100-hour inspection required for hire operations - no record found',
      isRequired: true,
      severity: 'critical',
    };
  }

  // For 100-hour, we track based on tach time, not calendar
  // Find the tach time at last 100-hour from logs
  const currentTach = aircraft.currentHours?.tach || 0;
  const lastLog = aircraft.logs?.find(l =>
    l.description?.toLowerCase().includes('100') ||
    l.description?.toLowerCase().includes('hundred')
  );
  const lastTachAt100 = lastLog?.tachTime || 0;
  const hoursSince = currentTach - lastTachAt100;

  // 10-hour overage allowance per FAR 91.409(b)
  const hoursRemaining = 100 - hoursSince;

  if (hoursRemaining < -10) {
    return {
      name: '100-Hour Inspection',
      code: '1',
      regulatoryReference: 'FAR 91.409(b)',
      lastCompleted: new Date(lastHundredHour),
      status: 'overdue',
      hoursRemaining,
      message: `100-hour OVERDUE by ${Math.abs(hoursRemaining).toFixed(1)} hours - ILLEGAL FOR HIRE`,
      isRequired: true,
      severity: 'critical',
    };
  }

  if (hoursRemaining <= 0) {
    return {
      name: '100-Hour Inspection',
      code: '1',
      regulatoryReference: 'FAR 91.409(b)',
      lastCompleted: new Date(lastHundredHour),
      status: 'due_soon',
      hoursRemaining,
      message: `100-hour in overage period (${Math.abs(hoursRemaining).toFixed(1)} hrs used of 10hr allowance)`,
      isRequired: true,
      severity: 'warning',
    };
  }

  if (hoursRemaining <= 10) {
    return {
      name: '100-Hour Inspection',
      code: '1',
      regulatoryReference: 'FAR 91.409(b)',
      lastCompleted: new Date(lastHundredHour),
      status: 'due_soon',
      hoursRemaining,
      message: `100-hour due in ${hoursRemaining.toFixed(1)} hours`,
      isRequired: true,
      severity: 'warning',
    };
  }

  return {
    name: '100-Hour Inspection',
    code: '1',
    regulatoryReference: 'FAR 91.409(b)',
    lastCompleted: new Date(lastHundredHour),
    status: 'current',
    hoursRemaining,
    message: `100-hour current (${hoursRemaining.toFixed(1)} hours remaining)`,
    isRequired: true,
    severity: 'ok',
  };
}

/**
 * Check Altimeter/Pitot-Static System (FAR 91.411)
 * Required: Every 24 calendar months for IFR operations
 */
function checkAltimeter(aircraft: IAircraft, asOfDate: Date, config: IAuditConfig): IInspectionCheck {
  // Note: Required for IFR in controlled airspace, but good practice for all
  const lastAltimeter = aircraft.airworthinessStatus?.altimeter || aircraft.maintenanceDates?.staticSystem;

  if (!lastAltimeter) {
    if (config.isIFRFlight) {
      return {
        name: 'Altimeter/Pitot-Static System',
        code: 'O',
        regulatoryReference: 'FAR 91.411',
        status: 'overdue',
        message: 'Altimeter system check required for IFR - no record found',
        isRequired: true,
        severity: 'critical',
      };
    }
    return {
      name: 'Altimeter/Pitot-Static System',
      code: 'O',
      regulatoryReference: 'FAR 91.411',
      status: 'na',
      message: 'No altimeter check on record (required for IFR)',
      isRequired: false,
      severity: 'warning',
    };
  }

  const dueDate = addCalendarMonths(new Date(lastAltimeter), 24);
  const daysRemaining = daysBetween(asOfDate, dueDate);

  if (daysRemaining < 0) {
    return {
      name: 'Altimeter/Pitot-Static System',
      code: 'O',
      regulatoryReference: 'FAR 91.411',
      lastCompleted: new Date(lastAltimeter),
      dueDate,
      status: 'overdue',
      daysRemaining,
      message: `Altimeter system check OVERDUE by ${Math.abs(daysRemaining)} days${config.isIFRFlight ? ' - ILLEGAL FOR IFR' : ''}`,
      isRequired: config.isIFRFlight,
      severity: config.isIFRFlight ? 'critical' : 'warning',
    };
  }

  if (daysRemaining <= 60) {
    return {
      name: 'Altimeter/Pitot-Static System',
      code: 'O',
      regulatoryReference: 'FAR 91.411',
      lastCompleted: new Date(lastAltimeter),
      dueDate,
      status: 'due_soon',
      daysRemaining,
      message: `Altimeter system check due in ${daysRemaining} days`,
      isRequired: config.isIFRFlight,
      severity: 'warning',
    };
  }

  return {
    name: 'Altimeter/Pitot-Static System',
    code: 'O',
    regulatoryReference: 'FAR 91.411',
    lastCompleted: new Date(lastAltimeter),
    dueDate,
    status: 'current',
    daysRemaining,
    message: `Altimeter system current until ${dueDate.toLocaleDateString()}`,
    isRequired: config.isIFRFlight,
    severity: 'ok',
  };
}

/**
 * Check Transponder (FAR 91.413)
 * Required: Every 24 calendar months
 */
function checkTransponder(aircraft: IAircraft, asOfDate: Date, config: IAuditConfig): IInspectionCheck {
  const lastTransponder = aircraft.airworthinessStatus?.transponder || aircraft.maintenanceDates?.transponder;

  if (!lastTransponder) {
    if (config.requiresTransponder) {
      return {
        name: 'Transponder Inspection',
        code: 'N',
        regulatoryReference: 'FAR 91.413',
        status: 'overdue',
        message: 'Transponder check required - no record found',
        isRequired: true,
        severity: 'critical',
      };
    }
    return {
      name: 'Transponder Inspection',
      code: 'N',
      regulatoryReference: 'FAR 91.413',
      status: 'na',
      message: 'No transponder check on record',
      isRequired: false,
      severity: 'warning',
    };
  }

  const dueDate = addCalendarMonths(new Date(lastTransponder), 24);
  const daysRemaining = daysBetween(asOfDate, dueDate);

  if (daysRemaining < 0) {
    return {
      name: 'Transponder Inspection',
      code: 'N',
      regulatoryReference: 'FAR 91.413',
      lastCompleted: new Date(lastTransponder),
      dueDate,
      status: 'overdue',
      daysRemaining,
      message: `Transponder check OVERDUE by ${Math.abs(daysRemaining)} days - ILLEGAL IN MODE C AIRSPACE`,
      isRequired: config.requiresTransponder,
      severity: 'critical',
    };
  }

  if (daysRemaining <= 60) {
    return {
      name: 'Transponder Inspection',
      code: 'N',
      regulatoryReference: 'FAR 91.413',
      lastCompleted: new Date(lastTransponder),
      dueDate,
      status: 'due_soon',
      daysRemaining,
      message: `Transponder check due in ${daysRemaining} days`,
      isRequired: config.requiresTransponder,
      severity: 'warning',
    };
  }

  return {
    name: 'Transponder Inspection',
    code: 'N',
    regulatoryReference: 'FAR 91.413',
    lastCompleted: new Date(lastTransponder),
    dueDate,
    status: 'current',
    daysRemaining,
    message: `Transponder current until ${dueDate.toLocaleDateString()}`,
    isRequired: config.requiresTransponder,
    severity: 'ok',
  };
}

/**
 * Check ELT (FAR 91.207)
 * Required: Every 12 calendar months AND battery replacement at half life or after 1 hour cumulative use
 */
function checkELT(aircraft: IAircraft, asOfDate: Date): IInspectionCheck {
  const lastELT = aircraft.airworthinessStatus?.elt;
  const batteryExpiration = aircraft.airworthinessStatus?.eltBatteryExpiration;

  if (!lastELT) {
    return {
      name: 'ELT Inspection',
      code: 'I',
      regulatoryReference: 'FAR 91.207',
      status: 'overdue',
      message: 'ELT inspection required - no record found',
      isRequired: true,
      severity: 'critical',
    };
  }

  const dueDate = addCalendarMonths(new Date(lastELT), 12);
  let daysRemaining = daysBetween(asOfDate, dueDate);
  let message = '';
  let status: InspectionStatus = 'current';
  let severity: 'ok' | 'warning' | 'critical' = 'ok';

  // Check battery expiration separately
  if (batteryExpiration) {
    const batteryDaysRemaining = daysBetween(asOfDate, new Date(batteryExpiration));
    if (batteryDaysRemaining < daysRemaining) {
      daysRemaining = batteryDaysRemaining;
      if (batteryDaysRemaining < 0) {
        status = 'overdue';
        severity = 'critical';
        message = `ELT battery EXPIRED ${Math.abs(batteryDaysRemaining)} days ago`;
      } else if (batteryDaysRemaining <= 30) {
        status = 'due_soon';
        severity = 'warning';
        message = `ELT battery expires in ${batteryDaysRemaining} days`;
      }
    }
  }

  // Check inspection date
  if (daysRemaining < 0 && status !== 'overdue') {
    return {
      name: 'ELT Inspection',
      code: 'I',
      regulatoryReference: 'FAR 91.207',
      lastCompleted: new Date(lastELT),
      dueDate,
      status: 'overdue',
      daysRemaining,
      message: `ELT inspection OVERDUE by ${Math.abs(daysRemaining)} days`,
      isRequired: true,
      severity: 'critical',
    };
  }

  if (status === 'overdue' || status === 'due_soon') {
    return {
      name: 'ELT Inspection',
      code: 'I',
      regulatoryReference: 'FAR 91.207',
      lastCompleted: new Date(lastELT),
      dueDate: batteryExpiration ? new Date(batteryExpiration) : dueDate,
      status,
      daysRemaining,
      message: message || `ELT due soon`,
      isRequired: true,
      severity,
    };
  }

  if (daysRemaining <= 30) {
    return {
      name: 'ELT Inspection',
      code: 'I',
      regulatoryReference: 'FAR 91.207',
      lastCompleted: new Date(lastELT),
      dueDate,
      status: 'due_soon',
      daysRemaining,
      message: `ELT inspection due in ${daysRemaining} days`,
      isRequired: true,
      severity: 'warning',
    };
  }

  return {
    name: 'ELT Inspection',
    code: 'I',
    regulatoryReference: 'FAR 91.207',
    lastCompleted: new Date(lastELT),
    dueDate,
    status: 'current',
    daysRemaining,
    message: `ELT current until ${dueDate.toLocaleDateString()}`,
    isRequired: true,
    severity: 'ok',
  };
}

/**
 * Check Compass (no specific FAR, but good practice)
 */
function checkCompass(aircraft: IAircraft): IInspectionCheck {
  // Compass swing is recommended but not strictly required by regulation
  return {
    name: 'Compass Swing',
    code: 'C',
    regulatoryReference: 'Advisory (no specific FAR)',
    status: 'na',
    message: 'Compass swing recommended after maintenance or major electrical work',
    isRequired: false,
    severity: 'ok',
  };
}

/**
 * Check Static System (FAR 91.411)
 * Same as Altimeter - often done together
 */
function checkStaticSystem(aircraft: IAircraft, asOfDate: Date, config: IAuditConfig): IInspectionCheck {
  const lastStatic = aircraft.airworthinessStatus?.staticSystem || aircraft.maintenanceDates?.staticSystem;

  if (!lastStatic) {
    if (config.isIFRFlight) {
      return {
        name: 'Static System Check',
        code: 'S',
        regulatoryReference: 'FAR 91.411',
        status: 'overdue',
        message: 'Static system check required for IFR - no record found',
        isRequired: true,
        severity: 'critical',
      };
    }
    return {
      name: 'Static System Check',
      code: 'S',
      regulatoryReference: 'FAR 91.411',
      status: 'na',
      message: 'No static system check on record (required for IFR)',
      isRequired: false,
      severity: 'warning',
    };
  }

  const dueDate = addCalendarMonths(new Date(lastStatic), 24);
  const daysRemaining = daysBetween(asOfDate, dueDate);

  if (daysRemaining < 0) {
    return {
      name: 'Static System Check',
      code: 'S',
      regulatoryReference: 'FAR 91.411',
      lastCompleted: new Date(lastStatic),
      dueDate,
      status: 'overdue',
      daysRemaining,
      message: `Static system check OVERDUE by ${Math.abs(daysRemaining)} days${config.isIFRFlight ? ' - ILLEGAL FOR IFR' : ''}`,
      isRequired: config.isIFRFlight,
      severity: config.isIFRFlight ? 'critical' : 'warning',
    };
  }

  if (daysRemaining <= 60) {
    return {
      name: 'Static System Check',
      code: 'S',
      regulatoryReference: 'FAR 91.411',
      lastCompleted: new Date(lastStatic),
      dueDate,
      status: 'due_soon',
      daysRemaining,
      message: `Static system check due in ${daysRemaining} days`,
      isRequired: config.isIFRFlight,
      severity: 'warning',
    };
  }

  return {
    name: 'Static System Check',
    code: 'S',
    regulatoryReference: 'FAR 91.411',
    lastCompleted: new Date(lastStatic),
    dueDate,
    status: 'current',
    daysRemaining,
    message: `Static system current until ${dueDate.toLocaleDateString()}`,
    isRequired: config.isIFRFlight,
    severity: 'ok',
  };
}

/**
 * Check MEL/KOEL compliance
 */
function checkMEL(aircraft: IAircraft): IMELCheck {
  const melConfig = aircraft.melConfig;
  const requiresMEL = melConfig?.requiresMEL || false;
  const melUploaded = !!(melConfig?.melDocumentId);
  const koelApplicable = melConfig?.koelApplicable || false;
  const koelUploaded = !!(melConfig?.koelDocumentId);

  // Get inoperative and deferred items
  const allItems = melConfig?.items || aircraft.mel || [];
  const inoperativeItems = allItems.filter(item => (item as any).status === 'inoperative');
  const deferredItems = allItems.filter(item => (item as any).status === 'deferred');

  let status: 'compliant' | 'warning' | 'non_compliant' = 'compliant';
  let message = 'MEL/KOEL status OK';

  if (requiresMEL && !melUploaded) {
    status = 'warning';
    message = 'MEL required for this aircraft type but not uploaded';
  }

  if (inoperativeItems.length > 0) {
    const requiredInop = inoperativeItems.filter(item => item.required);
    if (requiredInop.length > 0) {
      status = 'non_compliant';
      message = `${requiredInop.length} required item(s) inoperative - review MEL for dispatch authority`;
    } else {
      status = 'warning';
      message = `${inoperativeItems.length} item(s) inoperative - verify MEL compliance`;
    }
  }

  return {
    requiresMEL,
    melUploaded,
    koelApplicable,
    koelUploaded,
    inoperativeItems,
    deferredItems,
    status,
    message,
  };
}

/**
 * Determine aircraft types that typically require an MEL
 */
export function aircraftRequiresMEL(model: string, manufacturer: string): boolean {
  const modelUpper = model.toUpperCase();
  const mfrUpper = manufacturer.toUpperCase();

  // Complex aircraft, turboprops, jets typically have MELs
  const melRequired = [
    // Cessna singles that may have MEL (complex)
    'C182RG', 'T182', 'P210', '210',
    // Beechcraft
    'BONANZA', 'BARON', 'KING AIR', 'KINGAIR',
    // Piper complex
    'ARROW', 'COMANCHE', 'MALIBU', 'MERIDIAN', 'M350', 'M500', 'M600',
    // Cirrus
    'SF50', 'VISION JET',
    // Multi-engine
    'C310', 'C340', 'C401', 'C402', 'C414', 'C421', 'C425',
    'PA-23', 'PA-30', 'PA-34', 'PA-44',
    // Turboprops and jets
    'CITATION', 'LEARJET', 'PHENOM', 'TBM', 'PC-12', 'PILATUS',
  ];

  return melRequired.some(m => modelUpper.includes(m) || mfrUpper.includes(m));
}

/**
 * Calculate overall airworthiness score
 */
function calculateScore(checks: IInspectionCheck[], melCheck: IMELCheck): number {
  let score = 100;

  // Deduct for critical issues
  checks.forEach(check => {
    if (check.isRequired) {
      if (check.severity === 'critical') score -= 30;
      else if (check.severity === 'warning') score -= 10;
    } else {
      if (check.severity === 'critical') score -= 15;
      else if (check.severity === 'warning') score -= 5;
    }
  });

  // Deduct for MEL issues
  if (melCheck.status === 'non_compliant') score -= 25;
  else if (melCheck.status === 'warning') score -= 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Determine overall airworthiness status
 */
function determineOverallStatus(checks: IInspectionCheck[], melCheck: IMELCheck): AirworthinessResult {
  const hasCritical = checks.some(c => c.isRequired && c.severity === 'critical');
  const hasWarning = checks.some(c => c.isRequired && c.severity === 'warning');
  const melNonCompliant = melCheck.status === 'non_compliant';

  if (hasCritical || melNonCompliant) return 'grounded';
  if (hasWarning || melCheck.status === 'warning') return 'conditional';
  return 'airworthy';
}

/**
 * Run complete AV1ONICS audit
 */
export function runAV1ONICSAudit(
  aircraft: IAircraft,
  config: Partial<IAuditConfig> = {}
): IAV1ONICSAudit {
  const auditConfig = { ...DEFAULT_CONFIG, ...config };
  const asOfDate = new Date();

  // Run all checks
  const annual = checkAnnual(aircraft, asOfDate);
  const vor = checkVOR(aircraft, asOfDate, auditConfig);
  const hundredHour = check100Hour(aircraft, asOfDate, auditConfig);
  const altimeter = checkAltimeter(aircraft, asOfDate, auditConfig);
  const transponder = checkTransponder(aircraft, asOfDate, auditConfig);
  const elt = checkELT(aircraft, asOfDate);
  const compass = checkCompass(aircraft);
  const staticSystem = checkStaticSystem(aircraft, asOfDate, auditConfig);

  const allChecks = [annual, vor, hundredHour, altimeter, transponder, elt, compass, staticSystem];

  // Run MEL check
  const melCheck = checkMEL(aircraft);

  // Calculate score and status
  const overallScore = calculateScore(allChecks, melCheck);
  const overallStatus = determineOverallStatus(allChecks, melCheck);

  // Gather issues
  const criticalIssues = allChecks
    .filter(c => c.severity === 'critical')
    .map(c => `${c.name}: ${c.message}`);

  const warnings = allChecks
    .filter(c => c.severity === 'warning')
    .map(c => `${c.name}: ${c.message}`);

  if (melCheck.status === 'non_compliant') {
    criticalIssues.push(`MEL: ${melCheck.message}`);
  } else if (melCheck.status === 'warning') {
    warnings.push(`MEL: ${melCheck.message}`);
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (overallStatus === 'grounded') {
    recommendations.push('DO NOT FLY - Aircraft has critical airworthiness issues');
    recommendations.push('Contact A&P mechanic immediately to address overdue inspections');
  } else if (overallStatus === 'conditional') {
    recommendations.push('Schedule maintenance soon to address upcoming inspections');
    if (auditConfig.isIFRFlight) {
      recommendations.push('Verify all IFR-required inspections before instrument flight');
    }
  }

  // Check if MEL should be uploaded
  if (aircraftRequiresMEL(aircraft.model, aircraft.manufacturer) && !melCheck.melUploaded) {
    recommendations.push('This aircraft type typically requires an MEL - consider uploading');
  }

  return {
    aircraftId: aircraft._id.toString(),
    tailNumber: aircraft.tailNumber,
    auditDate: asOfDate,
    overallStatus,
    overallScore,
    checks: {
      annual,
      vor,
      hundredHour,
      altimeter,
      transponder,
      elt,
      compass,
      staticSystem,
    },
    melCheck,
    criticalIssues,
    warnings,
    recommendations,
  };
}

/**
 * Get AV1ONICS summary string (for display)
 */
export function getAV1ONICSSummary(audit: IAV1ONICSAudit): string {
  const checks = audit.checks;
  const codes = ['A', 'V', '1', 'O', 'N', 'I', 'C', 'S'];
  const checkArray = [
    checks.annual,
    checks.vor,
    checks.hundredHour,
    checks.altimeter,
    checks.transponder,
    checks.elt,
    checks.compass,
    checks.staticSystem,
  ];

  return codes.map((code, i) => {
    const check = checkArray[i];
    if (check.status === 'na') return `[${code}]`;
    if (check.severity === 'critical') return `❌${code}`;
    if (check.severity === 'warning') return `⚠️${code}`;
    return `✅${code}`;
  }).join(' ');
}

export default {
  runAV1ONICSAudit,
  getAV1ONICSSummary,
  aircraftRequiresMEL,
};
