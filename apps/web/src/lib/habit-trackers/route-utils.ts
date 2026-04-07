import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';
import { isHabitsEnabled } from '@/lib/habits/access';
import { HabitTrackerError, verifyWorkspaceMembership } from './service';

export function assertValidWorkspaceId(wsId: string) {
  if (!validate(wsId)) {
    throw new HabitTrackerError('Invalid workspace ID');
  }
}

export function assertValidTrackerId(trackerId: string) {
  if (!validate(trackerId)) {
    throw new HabitTrackerError('Invalid habit tracker ID');
  }
}

export function assertValidEntryId(entryId: string) {
  if (!validate(entryId)) {
    throw new HabitTrackerError('Invalid habit tracker entry ID');
  }
}

export async function createHabitTrackerRouteContext(
  request: Request,
  wsId: string
) {
  assertValidWorkspaceId(wsId);

  if (!(await isHabitsEnabled(wsId))) {
    throw new HabitTrackerError('Not found', 404);
  }

  const supabase = await createClient(request);
  const sbAdmin = await createAdminClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new HabitTrackerError('Please sign in to use habit trackers', 401);
  }

  await verifyWorkspaceMembership(supabase, wsId, user.id);

  return { supabase, sbAdmin, user };
}

export function habitTrackerErrorResponse(error: unknown) {
  if (error instanceof HabitTrackerError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }

  console.error('[habit-tracker]', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
