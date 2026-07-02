import { NextResponse } from 'next/server';
import { requireDevMode } from '../batch-upsert';

export async function PUT(_req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  // This migration is disabled because the user_group_indicators table was dropped
  // in migration 20250912103843_group_metrics.sql
  return NextResponse.json(
    {
      message:
        'Grouped score names migration is no longer available. The user_group_indicators table was removed in a recent database migration.',
      error: 'MIGRATION_DISABLED',
    },
    { status: 410 } // Gone - resource no longer available
  );
}
