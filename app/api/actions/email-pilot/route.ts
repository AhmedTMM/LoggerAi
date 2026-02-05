import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Flight from '@/lib/models/Flight';
import { sendPilotSafetyBriefing } from '@/lib/services/emailService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return new NextResponse('Invalid Action Link', { status: 400 });
    }

    // Token is flightId for demo
    const flight = await Flight.findById(token)
      .populate('pilot')
      .populate({
        path: 'aircraft',
        populate: { path: 'owner' }
      });

    if (!flight) {
      return new NextResponse('Flight not found or link expired', { status: 404 });
    }

    const aircraft = flight.aircraft as any;
    const ownerName = aircraft?.owner?.name || 'Aircraft Owner';

    // Trigger the email
    const result = await sendPilotSafetyBriefing(flight, ownerName);

    if (!result.success) {
      return new NextResponse(`Failed to send briefing: ${result.message}`, { status: 500 });
    }

    // Return nice success HTML
    return new NextResponse(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Action Verified</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f0fdf4; color: #166534; }
            .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); text-align: center; max-width: 400px; }
            .icon { font-size: 3rem; margin-bottom: 1rem; }
            h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
            p { margin: 0; color: #4b5563; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✅</div>
            <h1>Safety Briefing Sent</h1>
            <p>An automated safety briefing including all identified risk factors has been sent to the pilot.</p>
          </div>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });

  } catch (error) {
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
