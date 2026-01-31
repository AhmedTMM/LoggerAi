import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import EmailAction from '@/lib/models/EmailAction';
import Flight from '@/lib/models/Flight';
import { sendMechanicInspectionRequest } from '@/lib/services/emailService';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return new NextResponse(generateErrorHTML('Missing action token'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  try {
    // Ensure DB connection
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI!);
    }

    // Find the action by token
    const action = await EmailAction.findOne({ token });

    if (!action) {
      return new NextResponse(
        generateErrorHTML('Invalid or unknown action token. This link may have been used already.'),
        { status: 404, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Check if action has expired
    if (new Date() > action.expiresAt) {
      action.status = 'expired';
      await action.save();
      return new NextResponse(
        generateErrorHTML('This action link has expired. Links are valid for 24 hours after being sent.'),
        { status: 410, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Check if action has already been executed
    if (action.status === 'executed') {
      return new NextResponse(
        generateSuccessHTML(
          'Action Already Completed',
          `This inspection request was already sent to the mechanic at ${action.executedAt?.toLocaleString()}.`,
          false
        ),
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Verify this is an email_mechanic action
    if (action.actionType !== 'email_mechanic') {
      return new NextResponse(
        generateErrorHTML('Invalid action type for this endpoint.'),
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Check if we have a target email (mechanic email)
    if (!action.targetEmail) {
      return new NextResponse(
        generateErrorHTML('No mechanic email is configured for this aircraft. Please contact your maintenance provider directly.'),
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Get the flight with populated references
    const flight = await Flight.findById(action.flight)
      .populate('pilot')
      .populate('aircraft');

    if (!flight) {
      return new NextResponse(
        generateErrorHTML('The associated flight could not be found.'),
        { status: 404, headers: { 'Content-Type': 'text/html' } }
      );
    }

    const aircraft = flight.aircraft as any;
    const ownerName = aircraft?.owner?.name || 'Aircraft Owner';

    // Send the mechanic inspection request email
    const emailResult = await sendMechanicInspectionRequest(
      flight,
      action.targetEmail,
      action.targetName || 'Mechanic',
      ownerName
    );

    if (!emailResult.success) {
      return new NextResponse(
        generateErrorHTML(`Failed to send email: ${emailResult.message}`),
        { status: 500, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Mark the action as executed
    action.status = 'executed';
    action.executedAt = new Date();
    action.executedBy = action.recipientEmail;
    await action.save();

    return new NextResponse(
      generateSuccessHTML(
        'Inspection Request Sent!',
        `An urgent inspection request has been sent to <strong>${action.targetName || 'the mechanic'}</strong> at <strong>${action.targetEmail}</strong>. They will receive details about the aircraft concerns and will be asked to conduct a pre-flight inspection.`,
        true
      ),
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (error) {
    console.error('Email mechanic action error:', error);
    return new NextResponse(
      generateErrorHTML('An unexpected error occurred. Please try again later.'),
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

function generateSuccessHTML(title: string, message: string, isNew: boolean): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Aviation Intelligence</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f1f5f9;
      margin: 0;
      padding: 20px;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
      max-width: 500px;
      width: 100%;
      text-align: center;
      overflow: hidden;
    }
    .header {
      background: ${isNew ? '#7c3aed' : '#6b7280'};
      color: white;
      padding: 32px;
    }
    .icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .content {
      padding: 32px;
    }
    .message {
      color: #374151;
      line-height: 1.6;
      font-size: 16px;
    }
    .footer {
      padding: 16px 32px 32px;
      color: #9ca3af;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="icon">${isNew ? '🔧' : 'ℹ️'}</div>
      <h1>${title}</h1>
    </div>
    <div class="content">
      <p class="message">${message}</p>
    </div>
    <div class="footer">
      <p>Aviation Intelligence - Flight Safety System</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function generateErrorHTML(message: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Action Failed - Aviation Intelligence</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f1f5f9;
      margin: 0;
      padding: 20px;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
      max-width: 500px;
      width: 100%;
      text-align: center;
      overflow: hidden;
    }
    .header {
      background: #dc2626;
      color: white;
      padding: 32px;
    }
    .icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .content {
      padding: 32px;
    }
    .message {
      color: #374151;
      line-height: 1.6;
      font-size: 16px;
    }
    .footer {
      padding: 16px 32px 32px;
      color: #9ca3af;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="icon">❌</div>
      <h1>Action Failed</h1>
    </div>
    <div class="content">
      <p class="message">${message}</p>
    </div>
    <div class="footer">
      <p>Aviation Intelligence - Flight Safety System</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
