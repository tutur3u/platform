import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const taskSettingsSchema = z.object({
  task_auto_assign_to_self: z.boolean().optional(),
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

    // Fetch user task settings
    const { data: userData, error } = await supabase
      .from('users')
      .select('task_auto_assign_to_self')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error fetching user task settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch user task settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      task_auto_assign_to_self: userData.task_auto_assign_to_self ?? false,
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

    // Update user task settings
    const { data, error } = await supabase
      .from('users')
      .update({
        task_auto_assign_to_self: validatedData.task_auto_assign_to_self,
      })
      .eq('id', user.id)
      .select('task_auto_assign_to_self')
      .single();

    if (error) {
      console.error('Error updating user task settings:', error);
      return NextResponse.json(
        { error: 'Failed to update user task settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      task_auto_assign_to_self: data.task_auto_assign_to_self ?? false,
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
