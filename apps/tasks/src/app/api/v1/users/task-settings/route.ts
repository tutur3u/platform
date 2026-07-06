import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAuthenticatedSessionUser } from '@/lib/app-session-user';

const taskSettingsSchema = z.object({
  task_auto_assign_to_self: z.boolean().optional(),
  fade_completed_tasks: z.boolean().optional(),
});

const TASK_SETTINGS_SELECT = 'task_auto_assign_to_self, fade_completed_tasks';
const TASK_SETTINGS_CACHE_CONTROL =
  'private, max-age=60, stale-while-revalidate=30';

type TaskSettings = {
  task_auto_assign_to_self?: boolean | null;
  fade_completed_tasks?: boolean | null;
};

function normalizeTaskSettings(settings?: TaskSettings | null) {
  return {
    task_auto_assign_to_self: settings?.task_auto_assign_to_self ?? false,
    fade_completed_tasks: settings?.fade_completed_tasks ?? false,
  };
}

function buildTaskSettingsUpdate(
  settings: z.infer<typeof taskSettingsSchema>
): TaskSettings {
  const updateData: TaskSettings = {};

  if (settings.task_auto_assign_to_self !== undefined) {
    updateData.task_auto_assign_to_self = settings.task_auto_assign_to_self;
  }

  if (settings.fade_completed_tasks !== undefined) {
    updateData.fade_completed_tasks = settings.fade_completed_tasks;
  }

  return updateData;
}

function hasTaskSettingsUpdate(settings: TaskSettings) {
  return (
    settings.task_auto_assign_to_self !== undefined ||
    settings.fade_completed_tasks !== undefined
  );
}

async function readTaskSettings(supabase: TypedSupabaseClient, userId: string) {
  return supabase
    .from('user_private_details')
    .select(TASK_SETTINGS_SELECT)
    .eq('user_id', userId)
    .maybeSingle();
}

export async function GET() {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData, error } = await readTaskSettings(supabase, user.id);

    if (error) {
      console.error('Error fetching user task settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch user task settings' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ...normalizeTaskSettings(userData),
      },
      {
        headers: {
          'Cache-Control': TASK_SETTINGS_CACHE_CONTROL,
        },
      }
    );
  } catch (error) {
    console.error('Error in user task settings API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await req.json();
    const validatedData = taskSettingsSchema.parse(body);

    const updateData = buildTaskSettingsUpdate(validatedData);

    if (!hasTaskSettingsUpdate(updateData)) {
      const { data: userData, error } = await readTaskSettings(
        supabase,
        user.id
      );

      if (error) {
        console.error('Error fetching user task settings:', error);
        return NextResponse.json(
          { error: 'Failed to fetch user task settings' },
          { status: 500 }
        );
      }

      return NextResponse.json(normalizeTaskSettings(userData));
    }

    // Update user task settings in user_private_details
    const { data, error } = await supabase
      .from('user_private_details')
      .update(updateData)
      .eq('user_id', user.id)
      .select(TASK_SETTINGS_SELECT)
      .maybeSingle();

    if (error) {
      console.error('Error updating user task settings:', error);
      return NextResponse.json(
        { error: 'Failed to update user task settings' },
        { status: 500 }
      );
    }

    if (!data) {
      console.warn(
        'User private details row missing while updating task settings'
      );
    }

    return NextResponse.json(normalizeTaskSettings(data ?? updateData));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error in user task settings API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
