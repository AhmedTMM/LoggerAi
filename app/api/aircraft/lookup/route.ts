
import { NextRequest, NextResponse } from 'next/server';
import { fetchAircraftDetails } from '@/lib/services/firecrawlService';
import { requireAuth } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const searchParams = request.nextUrl.searchParams;
  const tailNumber = searchParams.get('tailNumber');

  if (!tailNumber) {
    return NextResponse.json(
      { success: false, error: 'Tail number is required' },
      { status: 400 }
    );
  }

  try {
    const result = await fetchAircraftDetails(tailNumber);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to look up aircraft' },
      { status: 500 }
    );
  }
}
