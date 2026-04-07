import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';
import { isHabitsEnabled } from '@/lib/habits/access';
import { HabitTrackerError, verifyWorkspaceMembership } from './service';

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
  const supabase = await createClient(request);
  const sbAdmin = await createAdminClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new HabitTrackerError('Please sign in to use habit trackers', 401);
  }

  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

  await verifyWorkspaceMembership(supabase, normalizedWsId, user.id);

  if (!(await isHabitsEnabled(normalizedWsId))) {
    throw new HabitTrackerError('Not found', 404);
  }

  return { supabase, sbAdmin, user, wsId: normalizedWsId };
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
