import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const GoalBodySchema = z.object({
  categoryId: z.string().nullable().optional(),
  dailyGoalMinutes: z.number().int().positive(),
  weeklyGoalMinutes: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const targetUserId = url.searchParams.get('userId');
    const queryUserId = targetUserId || user.id;

    // If targeting another user, verify they're in the same workspace
    if (targetUserId && targetUserId !== user.id) {
      const { data: targetUserCheck } = await supabase
        .from('workspace_members')
        .select('id:user_id')
        .eq('ws_id', normalizedWsId)
        .eq('user_id', targetUserId)
        .single();

      if (!targetUserCheck) {
        return NextResponse.json(
          { error: 'Target user not found in workspace' },
          { status: 404 }
        );
      }
    }

    // Fetch goals with category information
    const { data, error } = await supabase
      .from('time_tracking_goals')
      .select(
        `
        *,
        category:time_tracking_categories(*)
      `
      )
      .eq('ws_id', normalizedWsId)
      .eq('user_id', queryUserId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ goals: data });
  } catch (error) {
    console.error('Error fetching time tracking goals:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsedBody = GoalBodySchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parsedBody.error.issues.map((issue) => issue.message),
        },
        { status: 400 }
      );
    }

    const { categoryId, dailyGoalMinutes, weeklyGoalMinutes, isActive } =
      parsedBody.data;

    // Verify category exists if provided
    if (categoryId) {
      const { data: categoryCheck } = await supabase
        .from('time_tracking_categories')
        .select('id')
        .eq('id', categoryId)
        .eq('ws_id', normalizedWsId)
        .single();

      if (!categoryCheck) {
        return NextResponse.json(
          { error: 'Category not found' },
          { status: 404 }
        );
      }
    }

    // Use admin client for insertion
    const sbAdmin = await createAdminClient();

    const { data, error } = await sbAdmin
      .from('time_tracking_goals')
      .insert({
        ws_id: normalizedWsId,
        user_id: user.id,
        category_id: categoryId || null,
        daily_goal_minutes: dailyGoalMinutes,
        weekly_goal_minutes: weeklyGoalMinutes || null,
        is_active: isActive !== undefined ? isActive : true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select(
        `
        *,
        category:time_tracking_categories(*)
      `
      )
      .single();

    if (error) throw error;

    return NextResponse.json({ goal: data }, { status: 201 });
  } catch (error) {
    console.error('Error creating time tracking goal:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
