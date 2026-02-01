/**
 * Safety Analysis Service
 * Generates safety analysis from maintenance entries and aircraft data
 */

interface SafetyFinding {
  component: string;
  status: 'ok' | 'warning' | 'critical';
  message: string;
  lastMentioned?: Date;
}

interface SafetyAnalysis {
  lastAnalyzed: Date;
  score: number;
  findings: SafetyFinding[];
}

// Keywords to watch for (component -> severity keywords)
const componentKeywords: Record<string, { critical: string[]; warning: string[] }> = {
  'Engine': {
    critical: ['engine failure', 'cylinder crack', 'cam shaft', 'crankshaft', 'engine replacement'],
    warning: ['cylinder compression', 'oil leak', 'exhaust leak', 'rough running', 'engine mount'],
  },
  'Magnetos': {
    critical: ['magneto failure', 'no spark'],
    warning: ['magneto check', 'magneto timing', 'impulse coupling', 'points', '500 hour'],
  },
  'Alternator': {
    critical: ['alternator failure', 'no charging'],
    warning: ['alternator belt', 'voltage regulator', 'low voltage', 'alternator replaced'],
  },
  'Vacuum System': {
    critical: ['vacuum pump failure', 'no suction'],
    warning: ['vacuum pump', 'gyro', 'attitude indicator', 'directional gyro'],
  },
  'Propeller': {
    critical: ['propeller strike', 'blade crack', 'prop failure'],
    warning: ['prop balance', 'blade nick', 'prop overhaul', 'governor'],
  },
  'Fuel System': {
    critical: ['fuel leak', 'fuel contamination'],
    warning: ['fuel pump', 'fuel filter', 'fuel selector', 'carburetor'],
  },
  'Landing Gear': {
    critical: ['gear collapse', 'gear failure'],
    warning: ['brake', 'tire', 'wheel bearing', 'strut', 'shimmy'],
  },
  'Airframe': {
    critical: ['corrosion found', 'crack found', 'structural damage'],
    warning: ['skin repair', 'rivet', 'hinge', 'control surface'],
  },
};

/**
 * Generate safety analysis from maintenance entries
 * Analyzes patterns, identifies concerning components, and calculates a safety score
 */
export function generateSafetyAnalysis(entries: any[], aircraft: any): SafetyAnalysis {
  const findings: SafetyFinding[] = [];

  // Track mentions per component
  const componentMentions: Record<string, { count: number; lastDate?: Date; issues: string[] }> = {};

  // Analyze each entry
  for (const entry of entries) {
    const desc = (entry.description || '').toLowerCase();
    const entryDate = entry.date ? new Date(entry.date) : null;

    for (const [component, keywords] of Object.entries(componentKeywords)) {
      // Check critical keywords
      for (const kw of keywords.critical) {
        if (desc.includes(kw)) {
          if (!componentMentions[component]) {
            componentMentions[component] = { count: 0, issues: [] };
          }
          componentMentions[component].count++;
          componentMentions[component].issues.push(kw);
          if (entryDate && (!componentMentions[component].lastDate || entryDate > componentMentions[component].lastDate)) {
            componentMentions[component].lastDate = entryDate;
          }
        }
      }
      // Check warning keywords
      for (const kw of keywords.warning) {
        if (desc.includes(kw)) {
          if (!componentMentions[component]) {
            componentMentions[component] = { count: 0, issues: [] };
          }
          componentMentions[component].count++;
          if (!componentMentions[component].issues.includes(kw)) {
            componentMentions[component].issues.push(kw);
          }
          if (entryDate && (!componentMentions[component].lastDate || entryDate > componentMentions[component].lastDate)) {
            componentMentions[component].lastDate = entryDate;
          }
        }
      }
    }
  }

  // Generate findings based on component mentions
  let totalDeductions = 0;

  for (const [component, data] of Object.entries(componentMentions)) {
    const keywords = componentKeywords[component];

    // Check for critical issues
    const hasCritical = data.issues.some(issue =>
      keywords.critical.some(kw => issue.includes(kw))
    );

    if (hasCritical) {
      findings.push({
        component,
        status: 'critical',
        message: `Critical issue found: ${data.issues.slice(0, 2).join(', ')}`,
        lastMentioned: data.lastDate,
      });
      totalDeductions += 20;
    } else if (data.count >= 3) {
      // Multiple mentions = warning
      findings.push({
        component,
        status: 'warning',
        message: `Recurring maintenance: ${data.issues.slice(0, 3).join(', ')} (${data.count} mentions)`,
        lastMentioned: data.lastDate,
      });
      totalDeductions += 10;
    } else if (data.count >= 1) {
      findings.push({
        component,
        status: 'ok',
        message: `Recent service: ${data.issues.slice(0, 2).join(', ')}`,
        lastMentioned: data.lastDate,
      });
    }
  }

  // Check maintenance currency
  const now = new Date();
  const annualDate = aircraft.maintenanceDates?.annual ? new Date(aircraft.maintenanceDates.annual) : null;
  const transponderDate = aircraft.maintenanceDates?.transponder ? new Date(aircraft.maintenanceDates.transponder) : null;

  if (annualDate) {
    const monthsSinceAnnual = (now.getTime() - annualDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsSinceAnnual > 12) {
      findings.push({
        component: 'Annual Inspection',
        status: 'critical',
        message: `Annual expired ${Math.floor(monthsSinceAnnual - 12)} months ago`,
        lastMentioned: annualDate,
      });
      totalDeductions += 30;
    } else if (monthsSinceAnnual > 10) {
      findings.push({
        component: 'Annual Inspection',
        status: 'warning',
        message: `Annual due in ${Math.floor(12 - monthsSinceAnnual)} months`,
        lastMentioned: annualDate,
      });
      totalDeductions += 5;
    } else {
      findings.push({
        component: 'Annual Inspection',
        status: 'ok',
        message: `Annual current (${annualDate.toLocaleDateString()})`,
        lastMentioned: annualDate,
      });
    }
  }

  if (transponderDate) {
    const monthsSinceTransponder = (now.getTime() - transponderDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsSinceTransponder > 24) {
      findings.push({
        component: 'Transponder Check',
        status: 'critical',
        message: `Transponder check expired ${Math.floor(monthsSinceTransponder - 24)} months ago`,
        lastMentioned: transponderDate,
      });
      totalDeductions += 20;
    } else if (monthsSinceTransponder > 22) {
      findings.push({
        component: 'Transponder Check',
        status: 'warning',
        message: `Transponder check due in ${Math.floor(24 - monthsSinceTransponder)} months`,
        lastMentioned: transponderDate,
      });
      totalDeductions += 5;
    }
  }

  // Calculate final score (100 - deductions, min 0)
  const score = Math.max(0, Math.min(100, 100 - totalDeductions));

  // Sort findings: critical first, then warning, then ok
  findings.sort((a, b) => {
    const order = { critical: 0, warning: 1, ok: 2 };
    return order[a.status] - order[b.status];
  });

  return {
    lastAnalyzed: new Date(),
    score,
    findings: findings.slice(0, 10), // Limit to top 10 findings
  };
}

/**
 * Pilot Safety Analysis
 */
interface PilotSafetyFinding {
  category: string;
  riskLevel: 'low' | 'medium' | 'high';
  message: string;
}

interface PilotSafetyAnalysis {
  lastAnalyzed: Date;
  score: number;
  findings: PilotSafetyFinding[];
}

/**
 * Generate safety analysis for a pilot based on their experience and currency
 */
export function generatePilotSafetyAnalysis(pilot: any, flightEntries?: any[]): PilotSafetyAnalysis {
  const findings: PilotSafetyFinding[] = [];
  let score = 10; // Start with perfect score, deduct for issues

  const now = new Date();

  // Check medical expiration
  if (pilot.medicalExpiration) {
    const medicalDate = new Date(pilot.medicalExpiration);
    const daysUntilMedical = Math.floor((medicalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilMedical < 0) {
      findings.push({
        category: 'Medical',
        riskLevel: 'high',
        message: `Medical certificate expired ${Math.abs(daysUntilMedical)} days ago`,
      });
      score -= 3;
    } else if (daysUntilMedical < 30) {
      findings.push({
        category: 'Medical',
        riskLevel: 'medium',
        message: `Medical certificate expires in ${daysUntilMedical} days`,
      });
      score -= 1;
    } else {
      findings.push({
        category: 'Medical',
        riskLevel: 'low',
        message: `Medical certificate current (expires ${medicalDate.toLocaleDateString()})`,
      });
    }
  }

  // Check flight review expiration
  if (pilot.flightReviewExpiration) {
    const bfrDate = new Date(pilot.flightReviewExpiration);
    const daysUntilBfr = Math.floor((bfrDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilBfr < 0) {
      findings.push({
        category: 'Flight Review',
        riskLevel: 'high',
        message: `Flight review expired ${Math.abs(daysUntilBfr)} days ago`,
      });
      score -= 3;
    } else if (daysUntilBfr < 60) {
      findings.push({
        category: 'Flight Review',
        riskLevel: 'medium',
        message: `Flight review expires in ${daysUntilBfr} days`,
      });
      score -= 1;
    } else {
      findings.push({
        category: 'Flight Review',
        riskLevel: 'low',
        message: `Flight review current (expires ${bfrDate.toLocaleDateString()})`,
      });
    }
  }

  // Check experience levels
  const experience = pilot.experience || {};
  const totalHours = experience.totalHours || 0;
  const nightHours = experience.nightHours || 0;
  const ifrHours = experience.ifrHours || 0;
  const last90Days = experience.last90DaysHours || 0;
  const last30Days = experience.last30DaysHours || 0;

  // Low total time warning
  if (totalHours < 100) {
    findings.push({
      category: 'Experience',
      riskLevel: 'medium',
      message: `Low total time (${totalHours.toFixed(0)} hours). Consider additional training`,
    });
    score -= 1;
  } else if (totalHours >= 500) {
    findings.push({
      category: 'Experience',
      riskLevel: 'low',
      message: `${totalHours.toFixed(0)} total flight hours`,
    });
  }

  // Recent activity check
  if (last30Days < 1) {
    findings.push({
      category: 'Currency',
      riskLevel: 'high',
      message: 'No flights in the last 30 days. Consider a proficiency flight',
    });
    score -= 2;
  } else if (last30Days < 3) {
    findings.push({
      category: 'Currency',
      riskLevel: 'medium',
      message: `Only ${last30Days.toFixed(1)} hours in last 30 days`,
    });
    score -= 1;
  } else {
    findings.push({
      category: 'Currency',
      riskLevel: 'low',
      message: `${last30Days.toFixed(1)} hours in last 30 days`,
    });
  }

  // Night currency (need 3 takeoffs/landings in 90 days for passengers)
  if (nightHours < 10) {
    findings.push({
      category: 'Night Flying',
      riskLevel: 'medium',
      message: `Limited night experience (${nightHours.toFixed(1)} hours). Extra caution at night`,
    });
    score -= 1;
  }

  // IFR proficiency check for instrument-rated pilots
  if (pilot.certificates?.instrumentRated) {
    if (ifrHours < 20) {
      findings.push({
        category: 'IFR Currency',
        riskLevel: 'medium',
        message: `Low instrument time (${ifrHours.toFixed(1)} hours). Consider IPC`,
      });
      score -= 1;
    }
  }

  // Analyze flight entries if available
  if (flightEntries && flightEntries.length > 0) {
    const recentFlights = flightEntries.filter(e => {
      const d = new Date(e.date);
      return (now.getTime() - d.getTime()) < 90 * 24 * 60 * 60 * 1000;
    });

    if (recentFlights.length === 0) {
      findings.push({
        category: 'Recent Activity',
        riskLevel: 'high',
        message: 'No logged flights in the last 90 days',
      });
      score -= 2;
    }
  }

  // Cap score between 0 and 10
  score = Math.max(0, Math.min(10, score));

  // Sort findings: high risk first, then medium, then low
  findings.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.riskLevel] - order[b.riskLevel];
  });

  return {
    lastAnalyzed: new Date(),
    score,
    findings: findings.slice(0, 10),
  };
}
