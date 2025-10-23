import { NextResponse } from 'next/server';
import { tuturuuu } from 'tuturuuu';

export async function GET() {
  try {
    const analytics = await tuturuuu.storage.getAnalytics();
    return NextResponse.json(analytics);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to fetch analytics',
      },
      { status: 500 }
    );
  }
}
