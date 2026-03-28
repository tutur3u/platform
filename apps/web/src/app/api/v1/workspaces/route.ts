import { fetchWorkspaceSummaries } from '@tuturuuu/ui/lib/workspace-actions';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    return NextResponse.json(
      await fetchWorkspaceSummaries({ requireAuth: true })
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'WORKSPACE_SUMMARY_UNAUTHORIZED'
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error in workspaces API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
