import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const calendarSettingsSchema = z.object({
  timezone: z.string().optional(),
  first_day_of_week: z
    .enum(['auto', 'sunday', 'monday', 'saturday'])
    .optional(),
});

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    // Fetch workspace calendar settings
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .select('timezone, first_day_of_week')
      .eq('id', wsId)
      .single();

    if (error) {
      console.error('Error fetching workspace calendar settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch workspace calendar settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      timezone: workspace.timezone || 'auto',
      first_day_of_week: workspace.first_day_of_week || 'auto',
    });
  } catch (error) {
    console.error('Error in workspace calendar settings API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access and permissions
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validatedData = calendarSettingsSchema.parse(body);

    // Update workspace calendar settings
    const { data, error } = await supabase
      .from('workspaces')
      .update({
        timezone: validatedData.timezone,
        first_day_of_week: validatedData.first_day_of_week,
      })
      .eq('id', wsId)
      .select('timezone, first_day_of_week')
      .single();

    if (error) {
      console.error('Error updating workspace calendar settings:', error);
      return NextResponse.json(
        { error: 'Failed to update workspace calendar settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      timezone: data.timezone || 'auto',
      first_day_of_week: data.first_day_of_week || 'auto',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error in workspace calendar settings API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
