import { IAircraft } from '../models/Aircraft';
import { IPilot } from '../models/Pilot';
import { ILegalityCheck, IWeatherData } from '../models/Flight';
import { fetchWeatherData } from './weatherService';
import { MS_PER_DAY } from './documentProcessingUtils';

export interface AuditResult {
  checks: ILegalityCheck[];
  overallStatus: 'go' | 'caution' | 'no-go';
  weather?: IWeatherData;
}

export async function runBasicLegalityAudit(
  aircraft: IAircraft,
  pilot: IPilot,
  flightDate: Date,
  departureAirport: string
): Promise<AuditResult> {
  const checks: ILegalityCheck[] = [];
  const now = new Date(flightDate);

  // === MAINTENANCE CHECKS ===

  // Annual inspection check
  const annualDue = new Date(aircraft.maintenanceDates.annual);
  annualDue.setFullYear(annualDue.getFullYear() + 1);
  const annualDaysLeft = Math.ceil((annualDue.getTime() - now.getTime()) / MS_PER_DAY);

  if (annualDaysLeft < 0) {
    checks.push({
      category: 'maintenance',
      item: 'Annual Inspection',
      status: 'fail',
      message: `GROUNDED: Annual inspection overdue by ${Math.abs(annualDaysLeft)} days`,
      details: `Last annual: ${new Date(aircraft.maintenanceDates.annual).toLocaleDateString()}`,
    });
  } else if (annualDaysLeft < 30) {
    checks.push({
      category: 'maintenance',
      item: 'Annual Inspection',
      status: 'warning',
      message: `Annual inspection due in ${annualDaysLeft} days`,
      details: `Due date: ${annualDue.toLocaleDateString()}`,
    });
  } else {
    checks.push({
      category: 'maintenance',
      item: 'Annual Inspection',
      status: 'pass',
      message: 'Annual inspection current',
      details: `Valid until: ${annualDue.toLocaleDateString()}`,
    });
  }

  // 100-hour inspection (if applicable - for hire/instruction)
  if (aircraft.maintenanceDates.hundredHour) {
    checks.push({
      category: 'maintenance',
      item: '100-Hour Inspection',
      status: 'pass',
      message: '100-hour inspection tracking enabled',
      details: `Current tach: ${aircraft.currentHours.tach}`,
    });
  }

  // Transponder check (24-month)
  const transponderDue = new Date(aircraft.maintenanceDates.transponder);
  transponderDue.setMonth(transponderDue.getMonth() + 24);
  const transponderDaysLeft = Math.ceil((transponderDue.getTime() - now.getTime()) / MS_PER_DAY);

  if (transponderDaysLeft < 0) {
    checks.push({
      category: 'maintenance',
      item: 'Transponder Certification',
      status: 'fail',
      message: `GROUNDED: Transponder certification overdue by ${Math.abs(transponderDaysLeft)} days`,
    });
  } else if (transponderDaysLeft < 60) {
    checks.push({
      category: 'maintenance',
      item: 'Transponder Certification',
      status: 'warning',
      message: `Transponder certification due in ${transponderDaysLeft} days`,
    });
  } else {
    checks.push({
      category: 'maintenance',
      item: 'Transponder Certification',
      status: 'pass',
      message: 'Transponder certification current',
    });
  }

  // Static system/altimeter check (24-month for IFR)
  const staticDue = new Date(aircraft.maintenanceDates.staticSystem);
  staticDue.setMonth(staticDue.getMonth() + 24);
  const staticDaysLeft = Math.ceil((staticDue.getTime() - now.getTime()) / MS_PER_DAY);

  if (staticDaysLeft < 0) {
    checks.push({
      category: 'maintenance',
      item: 'Static System/Altimeter (IFR)',
      status: 'fail',
      message: `IFR GROUNDED: Static system check overdue by ${Math.abs(staticDaysLeft)} days`,
    });
  } else if (staticDaysLeft < 60) {
    checks.push({
      category: 'maintenance',
      item: 'Static System/Altimeter (IFR)',
      status: 'warning',
      message: `Static system check due in ${staticDaysLeft} days`,
    });
  } else {
    checks.push({
      category: 'maintenance',
      item: 'Static System/Altimeter (IFR)',
      status: 'pass',
      message: 'Static system/altimeter current for IFR',
    });
  }

  // === PILOT CHECKS ===

  // Medical certification
  const medicalExp = new Date(pilot.medicalExpiration);
  const medicalDaysLeft = Math.ceil((medicalExp.getTime() - now.getTime()) / MS_PER_DAY);

  if (medicalDaysLeft < 0) {
    checks.push({
      category: 'pilot',
      item: 'Medical Certificate',
      status: 'fail',
      message: `GROUNDED: Medical certificate expired ${Math.abs(medicalDaysLeft)} days ago`,
    });
  } else if (medicalDaysLeft < 30) {
    checks.push({
      category: 'pilot',
      item: 'Medical Certificate',
      status: 'warning',
      message: `Medical certificate expires in ${medicalDaysLeft} days`,
    });
  } else {
    checks.push({
      category: 'pilot',
      item: 'Medical Certificate',
      status: 'pass',
      message: 'Medical certificate current',
      details: `Expires: ${medicalExp.toLocaleDateString()}`,
    });
  }

  // Flight review (24-month)
  const flightReviewExp = new Date(pilot.flightReviewExpiration);
  const flightReviewDaysLeft = Math.ceil((flightReviewExp.getTime() - now.getTime()) / MS_PER_DAY);

  if (flightReviewDaysLeft < 0) {
    checks.push({
      category: 'pilot',
      item: 'Flight Review (BFR)',
      status: 'fail',
      message: `GROUNDED: Flight review expired ${Math.abs(flightReviewDaysLeft)} days ago`,
    });
  } else if (flightReviewDaysLeft < 60) {
    checks.push({
      category: 'pilot',
      item: 'Flight Review (BFR)',
      status: 'warning',
      message: `Flight review expires in ${flightReviewDaysLeft} days`,
    });
  } else {
    checks.push({
      category: 'pilot',
      item: 'Flight Review (BFR)',
      status: 'pass',
      message: 'Flight review current',
    });
  }

  // Currency check - 90-day landing currency
  if (pilot.experience.last90DaysHours < 3) {
    checks.push({
      category: 'pilot',
      item: '90-Day Currency',
      status: 'warning',
      message: `Low recent experience: ${pilot.experience.last90DaysHours} hours in last 90 days`,
      details: 'Consider a refresher flight with an instructor',
    });
  } else {
    checks.push({
      category: 'pilot',
      item: '90-Day Currency',
      status: 'pass',
      message: `Recent experience: ${pilot.experience.last90DaysHours} hours in last 90 days`,
    });
  }

  // === WEATHER/SAFETY CHECKS ===
  let weather: IWeatherData | undefined;

  try {
    const weatherResult = await fetchWeatherData(departureAirport);
    weather = weatherResult || undefined;

    if (weather) {
      // Check flight category vs pilot rating
      if (
        (weather.flightCategory === 'IFR' || weather.flightCategory === 'LIFR') &&
        !pilot.certificates.instrumentRated
      ) {
        checks.push({
          category: 'safety',
          item: 'Weather vs. Ratings',
          status: 'fail',
          message: `NO-GO: ${weather.flightCategory} conditions but pilot not instrument rated`,
          details: `Current conditions: ${weather.metar}`,
        });
      } else if (weather.flightCategory === 'MVFR' && !pilot.certificates.instrumentRated) {
        checks.push({
          category: 'safety',
          item: 'Weather vs. Ratings',
          status: 'warning',
          message: 'MVFR conditions - marginal VFR, exercise caution',
          details: `Visibility: ${weather.visibility} SM`,
        });
      } else {
        checks.push({
          category: 'safety',
          item: 'Weather Conditions',
          status: 'pass',
          message: `${weather.flightCategory} conditions`,
          details: `Visibility: ${weather.visibility} SM`,
        });
      }

      // Wind check
      if (weather.wind.gust && weather.wind.gust > 25) {
        checks.push({
          category: 'safety',
          item: 'Wind Conditions',
          status: 'warning',
          message: `Strong gusts reported: ${weather.wind.gust} kts`,
          details: `Wind: ${weather.wind.direction}° at ${weather.wind.speed} G${weather.wind.gust}`,
        });
      } else if (weather.wind.speed > 20) {
        checks.push({
          category: 'safety',
          item: 'Wind Conditions',
          status: 'warning',
          message: `Strong winds: ${weather.wind.speed} kts`,
        });
      } else {
        checks.push({
          category: 'safety',
          item: 'Wind Conditions',
          status: 'pass',
          message: `Winds acceptable: ${weather.wind.speed} kts`,
        });
      }
    }
  } catch (error) {
    checks.push({
      category: 'safety',
      item: 'Weather Data',
      status: 'warning',
      message: 'Unable to fetch current weather - manual check required',
    });
  }

  // Determine overall status
  const overallStatus = determineOverallStatus(checks);

  return { checks, overallStatus, weather };
}

function determineOverallStatus(checks: ILegalityCheck[]): 'go' | 'caution' | 'no-go' {
  if (checks.some((c) => c.status === 'fail')) {
    return 'no-go';
  }
  if (checks.some((c) => c.status === 'warning')) {
    return 'caution';
  }
  return 'go';
}
