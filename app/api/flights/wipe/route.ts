import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Flight from '@/lib/models/Flight';
import { requireAuth } from '@/lib/auth-helpers';
import { rateLimit } from '@/lib/rate-limit';

export async function DELETE() {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    // Strict rate limit on destructive operation: 2 per minute
    const rateLimited = rateLimit(`flights-wipe:${userId}`, { maxRequests: 2, windowSeconds: 60 });
    if (rateLimited) return rateLimited;

    await dbConnect();

    // Only delete flights belonging to the authenticated user
    const result = await Flight.deleteMany({ userId });

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error('Error wiping flights:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to wipe flights' },
      { status: 500 }
    );
  }
}
