import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { getUserSubscription } from '@/lib/subscription';

export async function GET() {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    const subscription = await getUserSubscription(userId!);

    if (!subscription) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      subscription,
    });
  } catch (err) {
    console.error('Get subscription error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to get subscription' },
      { status: 500 }
    );
  }
}
