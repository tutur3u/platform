import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const taskSettingsSchema = z.object({
  task_auto_assign_to_self: z.boolean().optional(),
  fade_completed_tasks: z.boolean().optional(),
});

export async function GET() {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch user task settings from user_private_details
    const { data: userData, error } = await supabase
      .from('user_private_details')
      .select('task_auto_assign_to_self, fade_completed_tasks')
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('Error fetching user task settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch user task settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      task_auto_assign_to_self: userData?.task_auto_assign_to_self ?? false,
      fade_completed_tasks: userData?.fade_completed_tasks ?? false,
    });
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await req.json();
    const validatedData = taskSettingsSchema.parse(body);

    // Build the update object dynamically (only include fields that are provided)
    const updateData: {
      task_auto_assign_to_self?: boolean;
      fade_completed_tasks?: boolean;
    } = {};

    if (validatedData.task_auto_assign_to_self !== undefined) {
      updateData.task_auto_assign_to_self =
        validatedData.task_auto_assign_to_self;
    }
    if (validatedData.fade_completed_tasks !== undefined) {
      updateData.fade_completed_tasks = validatedData.fade_completed_tasks;
    }

    // Update user task settings in user_private_details
    const { data, error } = await supabase
      .from('user_private_details')
      .update(updateData)
      .eq('user_id', user.id)
      .select('task_auto_assign_to_self, fade_completed_tasks')
      .single();

    if (error) {
      console.error('Error updating user task settings:', error);
      return NextResponse.json(
        { error: 'Failed to update user task settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      task_auto_assign_to_self: data?.task_auto_assign_to_self ?? false,
      fade_completed_tasks: data?.fade_completed_tasks ?? false,
    });
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
