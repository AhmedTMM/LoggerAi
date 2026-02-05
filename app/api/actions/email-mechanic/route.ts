import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Flight from '@/lib/models/Flight';
import { sendMechanicInspectionRequest } from '@/lib/services/emailService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return new NextResponse('Invalid Action Link', { status: 400 });
    }

    const flight = await Flight.findById(token)
      .populate('pilot')
      .populate({
        path: 'aircraft',
        populate: { path: 'owner' }
      });

    if (!flight) {
      return new NextResponse('Flight not found', { status: 404 });
    }

    const aircraft = flight.aircraft as any;
    const owner = aircraft?.owner;
    // Fallback to aircraft owner if no specific mechanic email
    const mechanicEmail = owner?.email;
    const senderName = owner?.name || 'Aircraft Owner';

    if (!mechanicEmail) {
      return new NextResponse('No mechanic or owner email on file', { status: 400 });
    }

    const result = await sendMechanicInspectionRequest(flight, mechanicEmail, 'Maintenance Team', senderName);

    if (!result.success) {
      return new NextResponse(`Failed: ${result.message}`, { status: 500 });
    }

    return new NextResponse(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Mechanic Requested</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f3ff; color: #5b21b6; }
            .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); text-align: center; max-width: 400px; }
            .icon { font-size: 3rem; margin-bottom: 1rem; }
            h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
            p { margin: 0; color: #4b5563; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">🔧</div>
            <h1>Inspection Requested</h1>
            <p>A work order has been generated and sent to the maintenance team for N${aircraft.tailNumber}.</p>
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
