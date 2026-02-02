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

    // Analyze weather experience from logbook entries
    const flightsWithWeather = flightEntries.filter(e => e.weather?.flightCategory);

    if (flightsWithWeather.length >= 5) {
      const weatherCounts = {
        VFR: flightsWithWeather.filter(e => e.weather?.flightCategory === 'VFR').length,
        MVFR: flightsWithWeather.filter(e => e.weather?.flightCategory === 'MVFR').length,
        IFR: flightsWithWeather.filter(e => e.weather?.flightCategory === 'IFR').length,
        LIFR: flightsWithWeather.filter(e => e.weather?.flightCategory === 'LIFR').length,
      };

      const total = flightsWithWeather.length;
      const vfrPercent = Math.round((weatherCounts.VFR / total) * 100);
      const mvfrPercent = Math.round((weatherCounts.MVFR / total) * 100);
      const ifrPercent = Math.round(((weatherCounts.IFR + weatherCounts.LIFR) / total) * 100);

      // Strong VFR-only experience (>90% VFR)
      if (vfrPercent > 90 && !pilot.certificates?.instrumentRated) {
        findings.push({
          category: 'Weather Experience',
          riskLevel: 'medium',
          message: `Limited weather experience (${vfrPercent}% VFR). Avoid marginal conditions`,
        });
        score -= 0.5;
      }
      // Good mixed weather experience
      else if (ifrPercent >= 15 && pilot.certificates?.instrumentRated) {
        findings.push({
          category: 'Weather Experience',
          riskLevel: 'low',
          message: `Strong weather experience (${ifrPercent}% IFR, ${mvfrPercent}% MVFR)`,
        });
      }
      // Some MVFR experience
      else if (mvfrPercent >= 20) {
        findings.push({
          category: 'Weather Experience',
          riskLevel: 'low',
          message: `Comfortable with marginal conditions (${mvfrPercent}% MVFR flights)`,
        });
      }
      // Mostly VFR but some marginal
      else if (vfrPercent >= 70 && mvfrPercent >= 10) {
        findings.push({
          category: 'Weather Experience',
          riskLevel: 'low',
          message: `Primarily VFR experience (${vfrPercent}% VFR, ${mvfrPercent}% MVFR)`,
        });
      }

      // Check for IFR flights without instrument rating
      if (!pilot.certificates?.instrumentRated && (weatherCounts.IFR + weatherCounts.LIFR) > 0) {
        findings.push({
          category: 'Weather Experience',
          riskLevel: 'high',
          message: `Logged ${weatherCounts.IFR + weatherCounts.LIFR} IFR flights without instrument rating`,
        });
        score -= 2;
      }
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

/**
 * Flight Safety Analysis
 * Assesses safety of a specific flight based on pilot experience and weather conditions
 */
interface FlightSafetyAnalysis {
  overallScore: number; // 0-100
  goNoGoRecommendation: 'GO' | 'CAUTION' | 'NO-GO';
  weatherRiskLevel: 'low' | 'medium' | 'high';
  weatherMessage: string;
  factors: Array<{
    category: string;
    impact: 'positive' | 'neutral' | 'negative';
    message: string;
  }>;
}

/**
 * Generate flight safety analysis based on pilot experience and weather
 */
export function generateFlightSafetyAnalysis(
  pilot: any,
  weather: { flightCategory: string; visibility?: number; ceiling?: number; wind?: any },
  flightEntries?: any[]
): FlightSafetyAnalysis {
  let score = 100;
  const factors: FlightSafetyAnalysis['factors'] = [];
  let weatherRiskLevel: 'low' | 'medium' | 'high' = 'low';
  let weatherMessage = '';

  const flightCategory = weather.flightCategory;
  const isInstrumentRated = pilot.certificates?.instrumentRated || false;

  // Analyze pilot's historical weather experience
  let pilotWeatherExperience = {
    vfrPercent: 100,
    mvfrPercent: 0,
    ifrPercent: 0,
    totalFlights: 0,
  };

  if (flightEntries && flightEntries.length > 0) {
    const flightsWithWeather = flightEntries.filter(e => e.weather?.flightCategory);
    if (flightsWithWeather.length >= 3) {
      const vfrCount = flightsWithWeather.filter(e => e.weather?.flightCategory === 'VFR').length;
      const mvfrCount = flightsWithWeather.filter(e => e.weather?.flightCategory === 'MVFR').length;
      const ifrCount = flightsWithWeather.filter(e => e.weather?.flightCategory === 'IFR' || e.weather?.flightCategory === 'LIFR').length;

      pilotWeatherExperience = {
        vfrPercent: Math.round((vfrCount / flightsWithWeather.length) * 100),
        mvfrPercent: Math.round((mvfrCount / flightsWithWeather.length) * 100),
        ifrPercent: Math.round((ifrCount / flightsWithWeather.length) * 100),
        totalFlights: flightsWithWeather.length,
      };
    }
  }

  // Assess weather risk based on conditions and pilot experience
  if (flightCategory === 'VFR') {
    weatherRiskLevel = 'low';
    weatherMessage = 'VFR conditions - good visibility and ceiling';
    factors.push({
      category: 'Weather Conditions',
      impact: 'positive',
      message: 'Clear VFR conditions',
    });
  } else if (flightCategory === 'MVFR') {
    // MVFR is medium risk, higher if pilot has little MVFR experience
    if (pilotWeatherExperience.totalFlights >= 5 && pilotWeatherExperience.mvfrPercent < 10 && pilotWeatherExperience.vfrPercent > 80) {
      weatherRiskLevel = 'high';
      weatherMessage = 'MVFR conditions - pilot has limited marginal weather experience';
      score -= 25;
      factors.push({
        category: 'Weather Experience Mismatch',
        impact: 'negative',
        message: `MVFR conditions but pilot has ${pilotWeatherExperience.vfrPercent}% VFR experience`,
      });
    } else {
      weatherRiskLevel = 'medium';
      weatherMessage = 'MVFR conditions - marginal VFR, exercise caution';
      score -= 15;
      factors.push({
        category: 'Weather Conditions',
        impact: 'neutral',
        message: 'MVFR - marginal VFR conditions',
      });
    }
  } else if (flightCategory === 'IFR' || flightCategory === 'LIFR') {
    if (!isInstrumentRated) {
      weatherRiskLevel = 'high';
      weatherMessage = 'IFR conditions - ILLEGAL for non-instrument rated pilot';
      score -= 60;
      factors.push({
        category: 'Legal Compliance',
        impact: 'negative',
        message: 'IFR conditions require instrument rating',
      });
    } else {
      // Has instrument rating, check experience
      const ifrHours = pilot.experience?.ifrHours || 0;
      if (ifrHours < 20) {
        weatherRiskLevel = 'high';
        weatherMessage = 'IFR conditions - low instrument time, consider IPC';
        score -= 30;
        factors.push({
          category: 'IFR Currency',
          impact: 'negative',
          message: `Low instrument time (${ifrHours.toFixed(1)} hours)`,
        });
      } else if (pilotWeatherExperience.ifrPercent >= 15) {
        weatherRiskLevel = 'low';
        weatherMessage = 'IFR conditions - pilot has strong IFR experience';
        score -= 5;
        factors.push({
          category: 'IFR Experience',
          impact: 'positive',
          message: `Pilot has ${pilotWeatherExperience.ifrPercent}% IFR experience`,
        });
      } else {
        weatherRiskLevel = 'medium';
        weatherMessage = 'IFR conditions - ensure recent IFR proficiency';
        score -= 20;
        factors.push({
          category: 'IFR Conditions',
          impact: 'neutral',
          message: 'IFR conditions - verify currency',
        });
      }
    }
  }

  // Check wind conditions
  if (weather.wind) {
    const windSpeed = weather.wind.speed || 0;
    const windGust = weather.wind.gust || 0;

    if (windGust > 25 || windSpeed > 20) {
      weatherRiskLevel = weatherRiskLevel === 'low' ? 'medium' : 'high';
      score -= 15;
      factors.push({
        category: 'Wind Conditions',
        impact: 'negative',
        message: `Strong winds: ${windSpeed}kt${windGust ? ` gusting ${windGust}kt` : ''}`,
      });
    } else if (windGust > 15 || windSpeed > 12) {
      score -= 5;
      factors.push({
        category: 'Wind Conditions',
        impact: 'neutral',
        message: `Moderate winds: ${windSpeed}kt${windGust ? ` gusting ${windGust}kt` : ''}`,
      });
    }
  }

  // Check visibility
  if (weather.visibility !== undefined && weather.visibility < 5) {
    if (weather.visibility < 3 && !isInstrumentRated) {
      weatherRiskLevel = 'high';
      score -= 20;
      factors.push({
        category: 'Visibility',
        impact: 'negative',
        message: `Low visibility (${weather.visibility} SM) - approaching IFR minimums`,
      });
    } else if (weather.visibility < 5) {
      score -= 10;
      factors.push({
        category: 'Visibility',
        impact: 'neutral',
        message: `Reduced visibility (${weather.visibility} SM)`,
      });
    }
  }

  // Check ceiling
  if (weather.ceiling !== undefined && weather.ceiling < 3000) {
    if (weather.ceiling < 1000 && !isInstrumentRated) {
      weatherRiskLevel = 'high';
      score -= 20;
      factors.push({
        category: 'Ceiling',
        impact: 'negative',
        message: `Low ceiling (${weather.ceiling} ft) - IFR conditions`,
      });
    } else if (weather.ceiling < 3000) {
      score -= 10;
      factors.push({
        category: 'Ceiling',
        impact: 'neutral',
        message: `Low ceiling (${weather.ceiling} ft)`,
      });
    }
  }

  // Pilot recent activity
  const last30Days = pilot.experience?.last30DaysHours || 0;
  if (last30Days < 1) {
    score -= 15;
    factors.push({
      category: 'Recent Activity',
      impact: 'negative',
      message: 'No recent flight time in last 30 days',
    });
  } else if (last30Days >= 5) {
    factors.push({
      category: 'Recent Activity',
      impact: 'positive',
      message: `Active pilot (${last30Days.toFixed(1)} hours last 30 days)`,
    });
  }

  // Ensure score stays in 0-100 range
  score = Math.max(0, Math.min(100, score));

  // Determine recommendation
  let recommendation: 'GO' | 'CAUTION' | 'NO-GO';
  if (score >= 70) {
    recommendation = 'GO';
  } else if (score >= 50) {
    recommendation = 'CAUTION';
  } else {
    recommendation = 'NO-GO';
  }

  return {
    overallScore: Math.round(score),
    goNoGoRecommendation: recommendation,
    weatherRiskLevel,
    weatherMessage,
    factors,
  };
}
