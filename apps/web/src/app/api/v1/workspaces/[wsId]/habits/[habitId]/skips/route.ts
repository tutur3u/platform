import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';
import { z } from 'zod';
import { revokeHabitSkip, upsertHabitSkip } from '@/lib/calendar/habit-skips';

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

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (!membership) {
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
