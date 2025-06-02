import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; goalId: string }> }
) {
  try {
    const { wsId, goalId } = await params;
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

    // Verify goal exists and belongs to user
    const { data: goal } = await supabase
      .from('time_tracking_goals')
      .select('*')
      .eq('id', goalId)
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const body = await request.json();
    const { categoryId, dailyGoalMinutes, weeklyGoalMinutes, isActive } = body;

    if (
      dailyGoalMinutes !== undefined &&
      (!dailyGoalMinutes || dailyGoalMinutes <= 0)
    ) {
      return NextResponse.json(
        { error: 'Daily goal minutes must be positive' },
        { status: 400 }
      );
    }

    // Verify category exists if provided
    if (categoryId && categoryId !== 'general') {
      const { data: categoryCheck } = await supabase
        .from('time_tracking_categories')
        .select('id')
        .eq('id', categoryId)
        .eq('ws_id', wsId)
        .single();

      if (!categoryCheck) {
        return NextResponse.json(
          { error: 'Category not found' },
          { status: 404 }
        );
      }
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (categoryId !== undefined) {
      updateData.category_id = categoryId === 'general' ? null : categoryId;
    }
    if (dailyGoalMinutes !== undefined) {
      updateData.daily_goal_minutes = dailyGoalMinutes;
    }
    if (weeklyGoalMinutes !== undefined) {
      updateData.weekly_goal_minutes = weeklyGoalMinutes || null;
    }
    if (isActive !== undefined) {
      updateData.is_active = isActive;
    }

    // Use admin client for update
    const adminSupabase = await createAdminClient();

    const { data, error } = await adminSupabase
      .from('time_tracking_goals')
      .update(updateData)
      .eq('id', goalId)
      .select(
        `
        *,
        category:time_tracking_categories(*)
      `
      )
      .single();

    if (error) throw error;

    return NextResponse.json({ goal: data });
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
    const { wsId, goalId } = await params;
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

    // Verify goal exists and belongs to user
    const { data: goal } = await supabase
      .from('time_tracking_goals')
      .select('id')
      .eq('id', goalId)
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    // Delete the goal
    const adminSupabase = await createAdminClient();
    const { error } = await adminSupabase
      .from('time_tracking_goals')
      .delete()
      .eq('id', goalId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting time tracking goal:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
