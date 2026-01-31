import { Resend } from 'resend';
import { IFlight } from '../models/Flight';

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

  const statusEmoji =
    flight.overallStatus === 'go'
      ? '✅'
      : flight.overallStatus === 'caution'
        ? '⚠️'
        : '❌';

  const statusText =
    flight.overallStatus === 'go'
      ? 'GO - Flight Approved'
      : flight.overallStatus === 'caution'
        ? 'CAUTION - Review Required'
        : 'NO-GO - Flight Not Recommended';

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
      from: 'Aviation Intelligence <safety@yourdomain.com>',
      to: [pilot.email],
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

  const statusColor =
    flight.overallStatus === 'go'
      ? '#10b981'
      : flight.overallStatus === 'caution'
        ? '#f59e0b'
        : '#ef4444';

  const statusText =
    flight.overallStatus === 'go'
      ? 'GO - Flight Approved'
      : flight.overallStatus === 'caution'
        ? 'CAUTION - Review Required'
        : 'NO-GO - Flight Not Recommended';

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

  const isDangerous = flight.overallStatus === 'no-go' || flight.overallStatus === 'caution';
  if (!isDangerous) {
    return { success: false, message: 'Flight is not dangerous - no alert needed' };
  }

  const statusColor = flight.overallStatus === 'no-go' ? '#ef4444' : '#f59e0b';
  const statusText = flight.overallStatus === 'no-go' ? 'NO-GO - FLIGHT NOT RECOMMENDED' : 'CAUTION - RISKS IDENTIFIED';
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
