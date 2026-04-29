import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types/supabase';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const RouteParamsSchema = z.object({
  wsId: z.string().min(1),
  goalId: z.guid(),
});

const PositiveIntSchema = z.coerce.number().int().positive();

const GoalPatchBodySchema = z
  .object({
    categoryId: z
      .preprocess(
        (value) => (value === 'general' ? null : value),
        z.guid().nullable()
      )
      .optional(),
    dailyGoalMinutes: PositiveIntSchema.optional(),
    weeklyGoalMinutes: z.union([PositiveIntSchema, z.null()]).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; goalId: string }> }
) {
  try {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid route parameters' },
        { status: 400 }
      );
    }

    const { wsId, goalId } = parsedParams.data;
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    // Verify workspace access
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    // Verify goal exists and belongs to user
    const { data: goal, error: goalError } = await sbAdmin
      .from('time_tracking_goals')
      .select('*')
      .eq('id', goalId)
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (goalError) {
      throw goalError;
    }

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    let parsedJson: unknown;
    try {
      parsedJson = await request.json();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Malformed JSON payload';
      return NextResponse.json(
        { error: 'Invalid JSON body', details: [message] },
        { status: 400 }
      );
    }

    const parsedBody = GoalPatchBodySchema.safeParse(parsedJson);
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
    if (categoryId != null) {
      const { data: categoryCheck, error: categoryCheckError } = await sbAdmin
        .from('time_tracking_categories')
        .select('id')
        .eq('id', categoryId)
        .eq('ws_id', normalizedWsId)
        .maybeSingle();

      if (categoryCheckError) {
        return NextResponse.json(
          { error: 'Failed to verify category' },
          { status: 500 }
        );
      }

      if (!categoryCheck) {
        return NextResponse.json(
          { error: 'Category not found' },
          { status: 404 }
        );
      }
    }

    // Prepare update data
    const updateData: Partial<
      Database['public']['Tables']['time_tracking_goals']['Update']
    > = {
      updated_at: new Date().toISOString(),
    };

    if (categoryId !== undefined) {
      updateData.category_id = categoryId;
    }
    if (dailyGoalMinutes !== undefined) {
      updateData.daily_goal_minutes = dailyGoalMinutes;
    }
    if (weeklyGoalMinutes !== undefined) {
      updateData.weekly_goal_minutes = weeklyGoalMinutes;
    }
    if (isActive !== undefined) {
      updateData.is_active = isActive;
    }

    const { data, error } = await sbAdmin
      .from('time_tracking_goals')
      .update(updateData)
      .eq('id', goalId)
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .select(
        `
        *,
        category:time_tracking_categories(*)
      `
      );

    if (error) throw error;

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    return NextResponse.json({ goal: data[0] });
  } catch (error) {
    console.error('Error updating time tracking goal:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; goalId: string }> }
) {
  try {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid route parameters' },
        { status: 400 }
      );
    }

    const { wsId, goalId } = parsedParams.data;
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    // Verify workspace access
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    // Verify goal exists and belongs to user
    const { data: goal, error: goalError } = await sbAdmin
      .from('time_tracking_goals')
      .select('id')
      .eq('id', goalId)
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (goalError) {
      throw goalError;
    }

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const { data: deletedGoals, error } = await sbAdmin
      .from('time_tracking_goals')
      .delete()
      .eq('id', goalId)
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .select('id');

    if (error) throw error;
    if (deletedGoals == null || deletedGoals.length === 0) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting time tracking goal:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
