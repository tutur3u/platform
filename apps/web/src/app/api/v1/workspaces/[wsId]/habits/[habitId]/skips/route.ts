import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';
import { z } from 'zod';
import { revokeHabitSkip, upsertHabitSkip } from '@/lib/calendar/habit-skips';
import { habitsNotFoundResponse, isHabitsEnabled } from '@/lib/habits/access';

const bodySchema = z.object({
  occurrenceDate: z.string().date(),
  sourceEventId: z.string().uuid().nullable().optional(),
});

interface RouteParams {
  wsId: string;
  habitId: string;
}

async function verifyAccess(request: Request, wsId: string, habitId: string) {
  const supabase = await createClient(request);
  const sbAdmin = await createAdminClient();

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: user.id,
    supabase: supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  const { data: habit, error: habitError } = await sbAdmin
    .from('workspace_habits')
    .select('id')
    .eq('id', habitId)
    .eq('ws_id', wsId)
    .is('deleted_at', null)
    .maybeSingle();

  if (habitError) {
    return {
      error: NextResponse.json(
        { error: 'Failed to load habit' },
        { status: 500 }
      ),
    };
  }

  if (!habit) {
    return {
      error: NextResponse.json({ error: 'Habit not found' }, { status: 404 }),
    };
  }

  return {
    sbAdmin,
    userId: user.id,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId, habitId } = await params;

    if (!validate(wsId) || !validate(habitId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or habit ID' },
        { status: 400 }
      );
    }

    if (!(await isHabitsEnabled(wsId))) {
      return habitsNotFoundResponse();
    }

    const access = await verifyAccess(request, wsId, habitId);
    if ('error' in access) {
      return access.error;
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    await upsertHabitSkip(access.sbAdmin as any, {
      wsId,
      habitId,
      occurrenceDate: parsed.data.occurrenceDate,
      createdBy: access.userId,
      sourceEventId: parsed.data.sourceEventId ?? null,
    });

    return NextResponse.json({
      success: true,
      occurrenceDate: parsed.data.occurrenceDate,
    });
  } catch (error) {
    console.error('Error creating habit skip:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId, habitId } = await params;

    if (!validate(wsId) || !validate(habitId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or habit ID' },
        { status: 400 }
      );
    }

    if (!(await isHabitsEnabled(wsId))) {
      return habitsNotFoundResponse();
    }

    const access = await verifyAccess(request, wsId, habitId);
    if ('error' in access) {
      return access.error;
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    await revokeHabitSkip(
      access.sbAdmin as any,
      wsId,
      habitId,
      parsed.data.occurrenceDate
    );

    return NextResponse.json({
      success: true,
      occurrenceDate: parsed.data.occurrenceDate,
    });
  } catch (error) {
    console.error('Error revoking habit skip:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
