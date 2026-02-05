import { Resend } from 'resend';
import { IFlight } from '../models/Flight';
import { getStatusConfig } from './documentProcessingUtils';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

interface EmailResult {
  success: boolean;
  message: string;
  id?: string;
}

export async function sendAuditEmail(flight: IFlight): Promise<EmailResult> {
  if (!resend) {
    console.warn('Resend API key not configured - email not sent');
    return {
      success: false,
      message: 'Email service not configured',
    };
  }

  const pilot = flight.pilot as any;
  const aircraft = flight.aircraft as any;

  if (!pilot?.email) {
    return {
      success: false,
      message: 'Pilot email not found',
    };
  }

  const statusCfg = getStatusConfig(flight.overallStatus);
  const statusEmoji = statusCfg.emoji;
  const statusText = statusCfg.text;

  // Build check summary
  const checkSummary = flight.legalityChecks
    .map((check) => {
      const icon = check.status === 'pass' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
      return `${icon} ${check.item}: ${check.message}`;
    })
    .join('\n');

  // Weather summary
  const weatherSummary = flight.weather
    ? `
Weather at ${flight.weather.station}:
- Conditions: ${flight.weather.flightCategory}
- Visibility: ${flight.weather.visibility} SM
- Wind: ${flight.weather.wind.direction}° at ${flight.weather.wind.speed} kts${flight.weather.wind.gust ? ` G${flight.weather.wind.gust}` : ''
    }
${flight.weather.ceiling ? `- Ceiling: ${flight.weather.ceiling} ft` : ''}
`
    : 'Weather data not available';

  const emailBody = `
Aviation Intelligence Brain - Flight Safety Audit Report
═══════════════════════════════════════════════════════════

${statusEmoji} OVERALL STATUS: ${statusText}

Flight Details:
───────────────────────────────────────────────────────────
Pilot: ${pilot.name}
Aircraft: ${aircraft.tailNumber} (${aircraft.model})
Date: ${new Date(flight.scheduledDate).toLocaleDateString()}
Departure: ${flight.departureAirport}
${flight.arrivalAirport ? `Arrival: ${flight.arrivalAirport}` : ''}

Legality Checks:
───────────────────────────────────────────────────────────
${checkSummary}

${weatherSummary}

═══════════════════════════════════════════════════════════
This is an automated safety briefing from Aviation Intelligence Brain.
Always verify information independently before flight.
  `.trim();

  try {
    const { data, error } = await resend.emails.send({
      from: 'Aviation Intelligence <onboarding@resend.dev>',
      to: ["ahmed@abushagur.com"],
      subject: `${statusEmoji} Flight Audit: ${aircraft.tailNumber} - ${statusText}`,
      text: emailBody,
    });

    if (error) {
      console.error('Email send error:', error);
      return {
        success: false,
        message: error.message,
      };
    }

    return {
      success: true,
      message: 'Email sent successfully',
      id: data?.id,
    };
  } catch (error) {
    console.error('Email service error:', error);
    return {
      success: false,
      message: (error as Error).message,
    };
  }
}

// Generate HTML version of the audit report
export function generateAuditHTML(flight: IFlight): string {
  const pilot = flight.pilot as any;
  const aircraft = flight.aircraft as any;
  const statusCfg = getStatusConfig(flight.overallStatus);
  const statusColor = statusCfg.color;
  const statusText = statusCfg.text;

  const checksHTML = flight.legalityChecks
    .map((check) => {
      const color =
        check.status === 'pass' ? '#10b981' : check.status === 'warning' ? '#f59e0b' : '#ef4444';
      return `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
          <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${color}; margin-right: 8px;"></span>
          ${check.item}
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${check.message}</td>
      </tr>
    `;
    })
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Flight Audit Report</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: ${statusColor}; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
    <h1 style="margin: 0; font-size: 24px;">${statusText}</h1>
  </div>

  <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
    <h2 style="margin: 0 0 12px 0; font-size: 18px;">Flight Details</h2>
    <p style="margin: 4px 0;"><strong>Pilot:</strong> ${pilot?.name || 'N/A'}</p>
    <p style="margin: 4px 0;"><strong>Aircraft:</strong> ${aircraft?.tailNumber || 'N/A'} (${aircraft?.model || 'N/A'})</p>
    <p style="margin: 4px 0;"><strong>Date:</strong> ${new Date(flight.scheduledDate).toLocaleDateString()}</p>
    <p style="margin: 4px 0;"><strong>Departure:</strong> ${flight.departureAirport}</p>
  </div>

  <h2 style="font-size: 18px;">Legality Checks</h2>
  <table style="width: 100%; border-collapse: collapse;">
    ${checksHTML}
  </table>

  <p style="color: #6b7280; font-size: 12px; margin-top: 20px; text-align: center;">
    This is an automated safety briefing from Aviation Intelligence Brain.
    Always verify information independently before flight.
  </p>
</body>
</html>
  `;
}

export async function sendOwnerDangerAlert(flight: IFlight): Promise<EmailResult> {
  if (!resend) {
    console.warn('Resend API key not configured - owner alert not sent');
    return { success: false, message: 'Email service not configured' };
  }

  const pilot = flight.pilot as any;
  const aircraft = flight.aircraft as any;

  if (!aircraft?.owner?.email) {
    return {
      success: false,
      message: 'Aircraft owner email not found',
    };
  }

  const statusCfg = getStatusConfig(flight.overallStatus);
  if (!statusCfg.isDangerous) {
    return { success: false, message: 'Flight is not dangerous - no alert needed' };
  }

  const statusColor = statusCfg.color;
  const statusText = statusCfg.text.toUpperCase();
  const urgencyText = flight.overallStatus === 'no-go' ? '🚨 URGENT SAFETY ALERT' : '⚠️ SAFETY ADVISORY';

  // Build risk factors list
  const failedChecks = flight.legalityChecks
    .filter(check => check.status === 'fail' || check.status === 'warning')
    .map(check => `<li style="margin: 8px 0; color: ${check.status === 'fail' ? '#ef4444' : '#f59e0b'};">
      <strong>${check.item}:</strong> ${check.message}
    </li>`)
    .join('');

  // Weather info
  const weatherHTML = flight.weather ? `
    <div style="background: #f0f9ff; padding: 12px; border-radius: 6px; margin: 16px 0;">
      <h3 style="margin: 0 0 8px 0; color: #0369a1;">Weather Conditions at ${flight.weather.station}</h3>
      <p style="margin: 4px 0;"><strong>Category:</strong> <span style="color: ${
        flight.weather.flightCategory === 'VFR' ? '#10b981' :
        flight.weather.flightCategory === 'MVFR' ? '#3b82f6' :
        flight.weather.flightCategory === 'IFR' ? '#f59e0b' : '#ef4444'
      }; font-weight: bold;">${flight.weather.flightCategory}</span></p>
      <p style="margin: 4px 0;"><strong>Visibility:</strong> ${flight.weather.visibility} SM</p>
      <p style="margin: 4px 0;"><strong>Wind:</strong> ${flight.weather.wind.direction}° at ${flight.weather.wind.speed} kts${flight.weather.wind.gust ? ` (gusts ${flight.weather.wind.gust} kts)` : ''}</p>
      ${flight.weather.ceiling ? `<p style="margin: 4px 0;"><strong>Ceiling:</strong> ${flight.weather.ceiling} ft</p>` : ''}
    </div>
  ` : '';

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Aircraft Owner Safety Alert</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">

  <div style="background: ${statusColor}; color: white; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
    <h1 style="margin: 0; font-size: 20px;">${urgencyText}</h1>
    <h2 style="margin: 8px 0 0 0; font-size: 28px; font-weight: bold;">${statusText}</h2>
  </div>

  <div style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px;">
    <h2 style="margin: 0 0 16px 0; color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
      Your Aircraft: ${aircraft.tailNumber}
    </h2>

    <p style="font-size: 16px; color: #374151; margin: 0 0 16px 0;">
      A flight has been planned using your aircraft that has been flagged with safety concerns.
    </p>

    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0;">
      <strong style="color: #92400e;">As the aircraft owner, you are being notified of potential risks.</strong>
    </div>

    <h3 style="color: #111827; margin: 20px 0 12px 0;">Flight Details</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #6b7280; width: 140px;">Pilot:</td>
        <td style="padding: 8px 0; color: #111827; font-weight: 500;">${pilot?.name || 'Unknown'}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
        <td style="padding: 8px 0; color: #111827; font-weight: 500;">${aircraft.tailNumber} (${aircraft.model})</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Scheduled Date:</td>
        <td style="padding: 8px 0; color: #111827; font-weight: 500;">${new Date(flight.scheduledDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Departure:</td>
        <td style="padding: 8px 0; color: #111827; font-weight: 500;">${flight.departureAirport}</td>
      </tr>
      ${flight.arrivalAirport ? `
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Arrival:</td>
        <td style="padding: 8px 0; color: #111827; font-weight: 500;">${flight.arrivalAirport}</td>
      </tr>
      ` : ''}
    </table>

    ${weatherHTML}

    <h3 style="color: #dc2626; margin: 20px 0 12px 0;">⚠️ Identified Risk Factors</h3>
    <ul style="margin: 0; padding-left: 20px;">
      ${failedChecks || '<li style="color: #6b7280;">No specific checks failed, but overall risk assessment indicates concerns.</li>'}
    </ul>
  </div>

  <div style="background: white; padding: 16px 24px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <p style="margin: 0; color: #6b7280; font-size: 14px; text-align: center;">
      This is an automated alert from <strong>Aviation Intelligence Brain</strong>.<br>
      You are receiving this because you are listed as the owner of ${aircraft.tailNumber}.
    </p>
  </div>

</body>
</html>
  `.trim();

  const textBody = `
${urgencyText}
${statusText}

Your Aircraft: ${aircraft.tailNumber}

A flight has been planned using your aircraft that has been flagged with safety concerns.

FLIGHT DETAILS:
- Pilot: ${pilot?.name || 'Unknown'}
- Aircraft: ${aircraft.tailNumber} (${aircraft.model})
- Date: ${new Date(flight.scheduledDate).toLocaleDateString()}
- Departure: ${flight.departureAirport}
${flight.arrivalAirport ? `- Arrival: ${flight.arrivalAirport}` : ''}

RISK FACTORS:
${flight.legalityChecks
  .filter(check => check.status === 'fail' || check.status === 'warning')
  .map(check => `- ${check.item}: ${check.message}`)
  .join('\n') || '- Overall risk assessment indicates concerns'}

This is an automated alert from Aviation Intelligence Brain.
  `.trim();

  try {
    const { data, error } = await resend.emails.send({
      from: 'Aviation Intelligence <safety@yourdomain.com>',
      to: [aircraft.owner.email],
      subject: `${flight.overallStatus === 'no-go' ? '🚨' : '⚠️'} OWNER ALERT: ${aircraft.tailNumber} - ${statusText}`,
      html: htmlBody,
      text: textBody,
    });

    if (error) {
      console.error('Owner alert email error:', error);
      return { success: false, message: error.message };
    }

    return {
      success: true,
      message: `Owner alert sent to ${aircraft.owner.email}`,
      id: data?.id
    };
  } catch (error) {
    console.error('Owner alert service error:', error);
    return { success: false, message: (error as Error).message };
  }
}

export async function sendThreatAlert(email: string, flight: IFlight, threats: string[]): Promise<EmailResult> {
  if (!resend) {
    console.warn('Resend API key not configured - threat alert not sent');
    return { success: false, message: 'Email service not configured' };
  }

  const aircraft = flight.aircraft as any;
  const threatList = threats.map(t => `- ${t}`).join('\n');

  const emailBody = `
⚠️ URGENT: Flight Status Changed to NO-GO
═══════════════════════════════════════════════════════════

New threats have been detected for your upcoming flight:

Flight Details:
Aircraft: ${aircraft?.tailNumber || 'Unknown'}
Departure: ${flight.departureAirport}
Date: ${new Date(flight.scheduledDate).toLocaleDateString()}

DETECTED THREATS:
───────────────────────────────────────────────────────────
${threatList}

Please review your flight plan immediately.
═══════════════════════════════════════════════════════════
`.trim();

  try {
    const { data, error } = await resend.emails.send({
      from: 'Aviation Intelligence <safety@yourdomain.com>',
      to: [email],
      subject: `⚠️ THREAT ALERT: Flight ${aircraft?.tailNumber || ''} Status Changed`,
      text: emailBody,
    });

    if (error) {
      console.error('Threat email error:', error);
      return { success: false, message: error.message };
    }

    return { success: true, message: 'Threat alert sent', id: data?.id };
  } catch (error) {
    console.error('Threat email service error:', error);
    return { success: false, message: (error as Error).message };
  }
}

interface PreFlightAlertResult extends EmailResult {
  actionsCreated?: boolean;
}

export async function sendPreFlightAgenticAlert(
  flight: IFlight,
  actionTokens: { emailPilotToken: string; emailMechanicToken?: string }
): Promise<PreFlightAlertResult> {
  if (!resend) {
    console.warn('Resend API key not configured - pre-flight alert not sent');
    return { success: false, message: 'Email service not configured' };
  }

  const pilot = flight.pilot as any;
  const aircraft = flight.aircraft as any;

  if (!aircraft?.owner?.email) {
    return { success: false, message: 'Aircraft owner email not found' };
  }

  const statusCfg = getStatusConfig(flight.overallStatus);
  if (!statusCfg.isDangerous) {
    return { success: false, message: 'Flight is not dangerous - no alert needed' };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const statusColor = statusCfg.color;
  const statusBgColor = statusCfg.bgColor;
  const urgencyText = flight.overallStatus === 'no-go' ? 'CRITICAL SAFETY ALERT' : 'PRE-FLIGHT SAFETY WARNING';
  const statusLabel = flight.overallStatus === 'no-go' ? 'NO-GO - IMMEDIATE ACTION REQUIRED' : 'CAUTION - REVIEW RECOMMENDED';

  // Calculate time until flight
  const flightTime = flight.scheduledDateTime || flight.scheduledDate;
  const timeUntilFlight = new Date(flightTime).getTime() - Date.now();
  const minutesUntilFlight = Math.round(timeUntilFlight / (1000 * 60));
  const timeDisplay = minutesUntilFlight <= 60
    ? `${minutesUntilFlight} minutes`
    : `${Math.round(minutesUntilFlight / 60)} hours`;

  // Build risk factors list
  const riskFactors = flight.legalityChecks
    .filter(check => check.status === 'fail' || check.status === 'warning')
    .map(check => ({
      item: check.item,
      message: check.message,
      severity: check.status
    }));

  const riskFactorsHTML = riskFactors.length > 0
    ? riskFactors.map(rf => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${rf.severity === 'fail' ? '#dc2626' : '#d97706'}; margin-right: 8px;"></span>
          <strong>${rf.item}</strong>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">
          ${rf.message}
        </td>
      </tr>
    `).join('')
    : '<tr><td colspan="2" style="padding: 12px; color: #6b7280;">Overall risk assessment indicates safety concerns.</td></tr>';

  // Weather info
  const weatherSection = flight.weather ? `
    <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <h3 style="margin: 0 0 12px 0; color: #0369a1; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
        Weather at ${flight.weather.station}
      </h3>
      <div style="display: grid; gap: 8px;">
        <div><strong>Category:</strong> <span style="color: ${
          flight.weather.flightCategory === 'VFR' ? '#059669' :
          flight.weather.flightCategory === 'MVFR' ? '#2563eb' :
          flight.weather.flightCategory === 'IFR' ? '#d97706' : '#dc2626'
        }; font-weight: 600;">${flight.weather.flightCategory}</span></div>
        <div><strong>Visibility:</strong> ${flight.weather.visibility} SM</div>
        <div><strong>Wind:</strong> ${flight.weather.wind.direction}° at ${flight.weather.wind.speed} kts${flight.weather.wind.gust ? ` (gusts ${flight.weather.wind.gust})` : ''}</div>
        ${flight.weather.ceiling ? `<div><strong>Ceiling:</strong> ${flight.weather.ceiling} ft</div>` : ''}
      </div>
    </div>
  ` : '';

  // Action buttons section
  const emailPilotUrl = `${baseUrl}/api/actions/email-pilot?token=${actionTokens.emailPilotToken}`;
  const emailMechanicUrl = actionTokens.emailMechanicToken
    ? `${baseUrl}/api/actions/email-mechanic?token=${actionTokens.emailMechanicToken}`
    : null;

  const actionsHTML = `
    <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <h3 style="margin: 0 0 8px 0; color: #1e293b; font-size: 18px;">
        Take Action Now
      </h3>
      <p style="margin: 0 0 20px 0; color: #64748b; font-size: 14px;">
        Click a button below to immediately send a safety briefing or request assistance:
      </p>

      <div style="display: flex; flex-direction: column; gap: 12px;">
        <!-- Email Pilot Button -->
        <a href="${emailPilotUrl}"
           style="display: block; background: #2563eb; color: white; text-decoration: none; padding: 16px 24px; border-radius: 8px; text-align: center; font-weight: 600; font-size: 16px;">
          <span style="font-size: 20px; margin-right: 8px;">✉️</span>
          Send Safety Briefing to Pilot (${pilot?.name || 'Unknown'})
        </a>

        ${emailMechanicUrl ? `
        <!-- Email Mechanic Button -->
        <a href="${emailMechanicUrl}"
           style="display: block; background: #7c3aed; color: white; text-decoration: none; padding: 16px 24px; border-radius: 8px; text-align: center; font-weight: 600; font-size: 16px;">
          <span style="font-size: 20px; margin-right: 8px;">🔧</span>
          Request Mechanic Inspection
        </a>
        ` : `
        <!-- No Mechanic Available -->
        <div style="background: #f1f5f9; color: #64748b; padding: 16px 24px; border-radius: 8px; text-align: center; font-size: 14px;">
          <span style="font-size: 20px; margin-right: 8px;">🔧</span>
          No mechanic assigned - Consider adding one for aircraft ${aircraft.tailNumber}
        </div>
        `}
      </div>

      <p style="margin: 20px 0 0 0; color: #94a3b8; font-size: 12px; text-align: center;">
        These actions will send automated emails on your behalf. Links expire in 24 hours.
      </p>
    </div>
  `;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pre-Flight Safety Alert</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background: #f1f5f9;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">

    <!-- Header Alert Banner -->
    <div style="background: ${statusColor}; color: white; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
      <div style="font-size: 32px; margin-bottom: 8px;">${flight.overallStatus === 'no-go' ? '🚨' : '⚠️'}</div>
      <h1 style="margin: 0; font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">
        ${urgencyText}
      </h1>
      <p style="margin: 8px 0 0 0; font-size: 16px; opacity: 0.9;">
        Flight departing in approximately <strong>${timeDisplay}</strong>
      </p>
    </div>

    <!-- Main Content Card -->
    <div style="background: white; padding: 24px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">

      <!-- Status Badge -->
      <div style="background: ${statusBgColor}; border: 1px solid ${statusColor}; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; text-align: center;">
        <span style="color: ${statusColor}; font-weight: 700; font-size: 14px;">
          ${statusLabel}
        </span>
      </div>

      <!-- Flight Details -->
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
          Flight Details
        </h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; width: 120px;">Pilot:</td>
            <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${pilot?.name || 'Unknown'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;">Aircraft:</td>
            <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${aircraft.tailNumber} (${aircraft.model})</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;">Scheduled:</td>
            <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">
              ${new Date(flight.scheduledDate).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              })}
              ${flight.scheduledTime ? ` at ${flight.scheduledTime}` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;">Route:</td>
            <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">
              ${flight.departureAirport}${flight.arrivalAirport ? ` → ${flight.arrivalAirport}` : ' (Local)'}
            </td>
          </tr>
        </table>
      </div>

      ${weatherSection}

      <!-- Risk Factors -->
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px 0; color: #dc2626; font-size: 16px; border-bottom: 2px solid #fecaca; padding-bottom: 8px;">
          ⚠️ Identified Risk Factors
        </h2>
        <table style="width: 100%; border-collapse: collapse; background: #fef2f2; border-radius: 8px; overflow: hidden;">
          ${riskFactorsHTML}
        </table>
      </div>

      <!-- ACTION SECTION -->
      ${actionsHTML}

      <!-- What happens next -->
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-top: 20px;">
        <h3 style="margin: 0 0 8px 0; color: #166534; font-size: 14px;">What happens when you take action?</h3>
        <ul style="margin: 0; padding-left: 20px; color: #166534; font-size: 13px;">
          <li style="margin-bottom: 4px;"><strong>Email Pilot:</strong> Sends an immediate safety briefing with all risk factors and recommendations to ${pilot?.email || 'the pilot'}</li>
          <li><strong>Request Mechanic:</strong> Notifies the mechanic to perform a pre-flight inspection and address any mechanical concerns</li>
        </ul>
      </div>

    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
      <p style="margin: 0 0 8px 0;">
        This is an automated pre-flight safety alert from <strong>Aviation Intelligence</strong>
      </p>
      <p style="margin: 0;">
        You're receiving this because you're listed as the owner of ${aircraft.tailNumber}
      </p>
    </div>

  </div>
</body>
</html>
`.trim();

  const textBody = `
${urgencyText}
${statusLabel}

Flight departing in approximately ${timeDisplay}

FLIGHT DETAILS
--------------
Pilot: ${pilot?.name || 'Unknown'}
Aircraft: ${aircraft.tailNumber} (${aircraft.model})
Scheduled: ${new Date(flight.scheduledDate).toLocaleDateString()}${flight.scheduledTime ? ` at ${flight.scheduledTime}` : ''}
Route: ${flight.departureAirport}${flight.arrivalAirport ? ` → ${flight.arrivalAirport}` : ' (Local)'}

RISK FACTORS
------------
${riskFactors.map(rf => `- ${rf.item}: ${rf.message}`).join('\n') || '- Overall risk assessment indicates safety concerns'}

TAKE ACTION
-----------
Email Pilot: ${emailPilotUrl}
${emailMechanicUrl ? `Request Mechanic: ${emailMechanicUrl}` : ''}

These action links expire in 24 hours.

---
Aviation Intelligence - Pre-Flight Safety Alert
You're receiving this because you're the owner of ${aircraft.tailNumber}
`.trim();

  try {
    const { data, error } = await resend.emails.send({
      from: 'Aviation Intelligence <safety@yourdomain.com>',
      to: [aircraft.owner.email],
      subject: `${flight.overallStatus === 'no-go' ? '🚨' : '⚠️'} ACTION REQUIRED: ${aircraft.tailNumber} flight in ${timeDisplay} - ${statusLabel}`,
      html: htmlBody,
      text: textBody,
    });

    if (error) {
      console.error('Pre-flight alert email error:', error);
      return { success: false, message: error.message };
    }

    return {
      success: true,
      message: `Pre-flight alert sent to ${aircraft.owner.email}`,
      id: data?.id,
      actionsCreated: true
    };
  } catch (error) {
    console.error('Pre-flight alert service error:', error);
    return { success: false, message: (error as Error).message };
  }
}

// Email sent from owner to pilot when action is triggered
export async function sendPilotSafetyBriefing(
  flight: IFlight,
  senderName: string
): Promise<EmailResult> {
  if (!resend) {
    return { success: false, message: 'Email service not configured' };
  }

  const pilot = flight.pilot as any;
  const aircraft = flight.aircraft as any;

  if (!pilot?.email) {
    return { success: false, message: 'Pilot email not found' };
  }

  const statusCfg = getStatusConfig(flight.overallStatus);
  const statusColor = statusCfg.color;
  const statusLabel = statusCfg.shortLabel;

  const riskFactors = flight.legalityChecks
    .filter(check => check.status === 'fail' || check.status === 'warning')
    .map(check => `- ${check.item}: ${check.message}`)
    .join('\n');

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Safety Briefing from ${senderName}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8fafc;">

  <div style="background: ${statusColor}; color: white; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 20px;">Safety Briefing from ${senderName}</h1>
    <p style="margin: 8px 0 0 0; opacity: 0.9;">Aircraft Owner - ${aircraft.tailNumber}</p>
  </div>

  <div style="background: white; padding: 24px; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">
      Dear ${pilot.name},
    </p>

    <p style="color: #374151; line-height: 1.6;">
      The flight safety system has flagged your upcoming flight with a <strong style="color: ${statusColor};">${statusLabel}</strong> status.
      As the owner of aircraft ${aircraft.tailNumber}, I wanted to personally reach out to ensure you're aware of the identified concerns.
    </p>

    <div style="background: #fef2f2; border-left: 4px solid ${statusColor}; padding: 16px; margin: 20px 0;">
      <h3 style="margin: 0 0 12px 0; color: #991b1b;">Identified Concerns:</h3>
      <pre style="margin: 0; white-space: pre-wrap; font-family: inherit; color: #374151;">${riskFactors || 'Overall risk assessment indicates safety concerns that warrant review.'}</pre>
    </div>

    <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <h3 style="margin: 0 0 8px 0; color: #166534;">Recommendations:</h3>
      <ul style="margin: 0; padding-left: 20px; color: #166534;">
        <li>Review all risk factors carefully before departure</li>
        <li>Consider postponing if conditions don't improve</li>
        <li>Ensure you've completed a thorough pre-flight inspection</li>
        <li>Contact me if you have any questions or concerns</li>
      </ul>
    </div>

    <p style="color: #374151; line-height: 1.6; margin-top: 20px;">
      Your safety is the top priority. Please acknowledge receipt of this briefing and confirm your go/no-go decision.
    </p>

    <p style="color: #374151; margin-top: 20px;">
      Fly safe,<br>
      <strong>${senderName}</strong><br>
      Owner, ${aircraft.tailNumber}
    </p>
  </div>

  <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 20px;">
    This message was sent via Aviation Intelligence on behalf of ${senderName}
  </p>
</body>
</html>
`.trim();

  const textBody = `
SAFETY BRIEFING FROM ${senderName.toUpperCase()}
Aircraft Owner - ${aircraft.tailNumber}

Dear ${pilot.name},

The flight safety system has flagged your upcoming flight with a ${statusLabel} status. As the owner of aircraft ${aircraft.tailNumber}, I wanted to personally reach out to ensure you're aware of the identified concerns.

IDENTIFIED CONCERNS:
${riskFactors || 'Overall risk assessment indicates safety concerns that warrant review.'}

RECOMMENDATIONS:
- Review all risk factors carefully before departure
- Consider postponing if conditions don't improve
- Ensure you've completed a thorough pre-flight inspection
- Contact me if you have any questions or concerns

Your safety is the top priority. Please acknowledge receipt of this briefing and confirm your go/no-go decision.

Fly safe,
${senderName}
Owner, ${aircraft.tailNumber}

---
This message was sent via Aviation Intelligence
`.trim();

  try {
    const { data, error } = await resend.emails.send({
      from: 'Aviation Intelligence <safety@yourdomain.com>',
      to: [pilot.email],
      replyTo: aircraft.owner?.email,
      subject: `⚠️ Safety Briefing from ${senderName} - ${aircraft.tailNumber} Flight`,
      html: htmlBody,
      text: textBody,
    });

    if (error) {
      console.error('Pilot briefing email error:', error);
      return { success: false, message: error.message };
    }

    return { success: true, message: `Briefing sent to ${pilot.email}`, id: data?.id };
  } catch (error) {
    console.error('Pilot briefing service error:', error);
    return { success: false, message: (error as Error).message };
  }
}

// Email sent to mechanic when action is triggered
export async function sendMechanicInspectionRequest(
  flight: IFlight,
  mechanicEmail: string,
  mechanicName: string,
  senderName: string
): Promise<EmailResult> {
  if (!resend) {
    return { success: false, message: 'Email service not configured' };
  }

  const pilot = flight.pilot as any;
  const aircraft = flight.aircraft as any;

  const mechanicalConcerns = flight.legalityChecks
    .filter(check =>
      (check.status === 'fail' || check.status === 'warning') &&
      (check.category === 'maintenance' || check.category === 'safety')
    )
    .map(check => `- ${check.item}: ${check.message}`)
    .join('\n');

  const flightTime = flight.scheduledDateTime || flight.scheduledDate;
  const timeUntilFlight = new Date(flightTime).getTime() - Date.now();
  const minutesUntilFlight = Math.round(timeUntilFlight / (1000 * 60));

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Urgent Inspection Request</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8fafc;">

  <div style="background: #7c3aed; color: white; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
    <div style="font-size: 32px; margin-bottom: 8px;">🔧</div>
    <h1 style="margin: 0; font-size: 20px;">Urgent Inspection Request</h1>
    <p style="margin: 8px 0 0 0; opacity: 0.9;">Flight in approximately ${minutesUntilFlight} minutes</p>
  </div>

  <div style="background: white; padding: 24px; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">
      Dear ${mechanicName},
    </p>

    <p style="color: #374151; line-height: 1.6;">
      ${senderName}, the owner of aircraft <strong>${aircraft.tailNumber}</strong>, has requested an urgent pre-flight inspection.
      The automated safety system has identified potential mechanical or maintenance concerns.
    </p>

    <div style="background: #f5f3ff; border: 1px solid #c4b5fd; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <h3 style="margin: 0 0 12px 0; color: #5b21b6;">Aircraft Details:</h3>
      <table style="width: 100%;">
        <tr><td style="color: #6b7280; padding: 4px 0;">Tail Number:</td><td style="font-weight: 500;">${aircraft.tailNumber}</td></tr>
        <tr><td style="color: #6b7280; padding: 4px 0;">Model:</td><td style="font-weight: 500;">${aircraft.model}</td></tr>
        <tr><td style="color: #6b7280; padding: 4px 0;">Scheduled Pilot:</td><td style="font-weight: 500;">${pilot?.name || 'Unknown'}</td></tr>
        <tr><td style="color: #6b7280; padding: 4px 0;">Flight Time:</td><td style="font-weight: 500;">${new Date(flightTime).toLocaleString()}</td></tr>
      </table>
    </div>

    ${mechanicalConcerns ? `
    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0;">
      <h3 style="margin: 0 0 12px 0; color: #991b1b;">Flagged Concerns:</h3>
      <pre style="margin: 0; white-space: pre-wrap; font-family: inherit; color: #374151;">${mechanicalConcerns}</pre>
    </div>
    ` : ''}

    <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <h3 style="margin: 0 0 8px 0; color: #92400e;">Requested Actions:</h3>
      <ul style="margin: 0; padding-left: 20px; color: #92400e;">
        <li>Conduct thorough pre-flight inspection</li>
        <li>Address any flagged maintenance concerns</li>
        <li>Verify aircraft airworthiness</li>
        <li>Report findings to owner and pilot</li>
      </ul>
    </div>

    <p style="color: #374151; margin-top: 20px;">
      Please respond to this request as soon as possible given the limited time before the scheduled departure.
    </p>

    <p style="color: #374151; margin-top: 20px;">
      Thank you,<br>
      <strong>Aviation Intelligence</strong><br>
      On behalf of ${senderName}
    </p>
  </div>

  <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 20px;">
    This inspection request was sent via Aviation Intelligence
  </p>
</body>
</html>
`.trim();

  const textBody = `
URGENT INSPECTION REQUEST
Flight in approximately ${minutesUntilFlight} minutes

Dear ${mechanicName},

${senderName}, the owner of aircraft ${aircraft.tailNumber}, has requested an urgent pre-flight inspection.
The automated safety system has identified potential mechanical or maintenance concerns.

AIRCRAFT DETAILS:
- Tail Number: ${aircraft.tailNumber}
- Model: ${aircraft.model}
- Scheduled Pilot: ${pilot?.name || 'Unknown'}
- Flight Time: ${new Date(flightTime).toLocaleString()}

${mechanicalConcerns ? `FLAGGED CONCERNS:\n${mechanicalConcerns}\n` : ''}

REQUESTED ACTIONS:
- Conduct thorough pre-flight inspection
- Address any flagged maintenance concerns
- Verify aircraft airworthiness
- Report findings to owner and pilot

Please respond to this request as soon as possible.

Thank you,
Aviation Intelligence
On behalf of ${senderName}
`.trim();

  try {
    const { data, error } = await resend.emails.send({
      from: 'Aviation Intelligence <safety@yourdomain.com>',
      to: [mechanicEmail],
      replyTo: aircraft.owner?.email,
      subject: `🔧 URGENT: Pre-Flight Inspection Request - ${aircraft.tailNumber}`,
      html: htmlBody,
      text: textBody,
    });

    if (error) {
      console.error('Mechanic request email error:', error);
      return { success: false, message: error.message };
    }

    return { success: true, message: `Inspection request sent to ${mechanicEmail}`, id: data?.id };
  } catch (error) {
    console.error('Mechanic request service error:', error);
    return { success: false, message: (error as Error).message };
  }
}
