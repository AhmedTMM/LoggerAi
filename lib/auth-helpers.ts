import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function getServerSession() {
  const session = await auth();
  return session;
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function requireAuth() {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
      userId: null,
    };
  }

  return {
    error: null,
    userId: session.user.id,
    user: session.user,
  };
}
