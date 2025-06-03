import {
  createAdminClient,
  createClient,
} from '@ncthub/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
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

    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'recent';
    const categoryId = url.searchParams.get('categoryId');
    const taskId = url.searchParams.get('taskId');
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    const targetUserId = url.searchParams.get('userId'); // New parameter for viewing other users
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Determine which user's data to fetch (current user or specified user)
    const queryUserId = targetUserId || user.id;

    // If targeting another user, verify they're in the same workspace
    if (targetUserId && targetUserId !== user.id) {
      const { data: targetUserCheck } = await supabase
        .from('workspace_members')
        .select('id:user_id')
        .eq('ws_id', wsId)
        .eq('user_id', targetUserId)
        .single();

      if (!targetUserCheck) {
        return NextResponse.json(
          { error: 'Target user not found in workspace' },
          { status: 404 }
        );
      }
    }

    if (type === 'running') {
      // Get current running session
      const { data, error } = await supabase
        .from('time_tracking_sessions')
        .select(
          `
          *,
          category:time_tracking_categories(*),
          task:tasks(*)
        `
        )
        .eq('ws_id', wsId)
        .eq('user_id', queryUserId)
        .eq('is_running', true)
        .maybeSingle();

      if (error) throw error;
      return NextResponse.json({ session: data });
    }

    if (type === 'recent' || type === 'history') {
      // Build query for sessions
      let query = supabase
        .from('time_tracking_sessions')
        .select(
          `
          *,
          category:time_tracking_categories(*),
          task:tasks(*)
        `
        )
        .eq('ws_id', wsId)
        .eq('user_id', queryUserId);

      if (type === 'recent') {
        query = query.eq('is_running', false);
      }

      // Apply filters
      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }

      if (taskId) {
        query = query.eq('task_id', taskId);
      }

      if (dateFrom) {
        query = query.gte('start_time', dateFrom);
      }

      if (dateTo) {
        query = query.lte('start_time', dateTo);
      }

      // Apply pagination and ordering
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return NextResponse.json({ sessions: data });
    }

    if (type === 'stats') {
      // Calculate time statistics
      const today = new Date();
      const startOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      const startOfWeek = new Date(
        today.getTime() - today.getDay() * 24 * 60 * 60 * 1000
      );
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      // Get all sessions with category information for breakdown
      const [todayData, weekData, monthData] = await Promise.all([
        supabase
          .from('time_tracking_sessions')
          .select('duration_seconds, category_id')
          .eq('ws_id', wsId)
          .eq('user_id', queryUserId)
          .gte('start_time', startOfToday.toISOString())
          .not('duration_seconds', 'is', null),
        supabase
          .from('time_tracking_sessions')
          .select('duration_seconds, category_id')
          .eq('ws_id', wsId)
          .eq('user_id', queryUserId)
          .gte('start_time', startOfWeek.toISOString())
          .not('duration_seconds', 'is', null),
        supabase
          .from('time_tracking_sessions')
          .select('duration_seconds, category_id')
          .eq('ws_id', wsId)
          .eq('user_id', queryUserId)
          .gte('start_time', startOfMonth.toISOString())
          .not('duration_seconds', 'is', null),
      ]);

      // Calculate total times
      const totalTodayTime =
        todayData.data?.reduce(
          (sum, session) => sum + (session.duration_seconds || 0),
          0
        ) || 0;

      const totalWeekTime =
        weekData.data?.reduce(
          (sum, session) => sum + (session.duration_seconds || 0),
          0
        ) || 0;

      const totalMonthTime =
        monthData.data?.reduce(
          (sum, session) => sum + (session.duration_seconds || 0),
          0
        ) || 0;

      // Calculate category breakdowns
      const todayByCategory: Record<string, number> = {};
      const weekByCategory: Record<string, number> = {};
      const monthByCategory: Record<string, number> = {};

      todayData.data?.forEach((session) => {
        const categoryKey = session.category_id || 'general';
        todayByCategory[categoryKey] =
          (todayByCategory[categoryKey] || 0) + (session.duration_seconds || 0);
      });

      weekData.data?.forEach((session) => {
        const categoryKey = session.category_id || 'general';
        weekByCategory[categoryKey] =
          (weekByCategory[categoryKey] || 0) + (session.duration_seconds || 0);
      });

      monthData.data?.forEach((session) => {
        const categoryKey = session.category_id || 'general';
        monthByCategory[categoryKey] =
          (monthByCategory[categoryKey] || 0) + (session.duration_seconds || 0);
      });

      const stats = {
        todayTime: totalTodayTime,
        weekTime: totalWeekTime,
        monthTime: totalMonthTime,
        streak: 0, // Can be calculated based on requirements
        categoryBreakdown: {
          today: todayByCategory,
          week: weekByCategory,
          month: monthByCategory,
        },
      };

      return NextResponse.json({ stats });
    }

    return NextResponse.json(
      { error: 'Invalid type parameter' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in time tracking sessions API:', error);
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

    const body = await request.json();
    const { title, description, categoryId, taskId } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Use service role client for secure operations
    const adminSupabase = await createAdminClient(); // This should use service role

    // Stop any existing running sessions
    await adminSupabase
      .from('time_tracking_sessions')
      .update({
        end_time: new Date().toISOString(),
        is_running: false,
        updated_at: new Date().toISOString(),
      })
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .eq('is_running', true);

    // Create new session with server timestamp
    const { data, error } = await adminSupabase
      .from('time_tracking_sessions')
      .insert({
        ws_id: wsId,
        user_id: user.id,
        title: title.trim(),
        description: description?.trim() || null,
        category_id: categoryId || null,
        task_id: taskId || null,
        start_time: new Date().toISOString(),
        is_running: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select(
        `
        *,
        category:time_tracking_categories(*),
        task:tasks(*)
      `
      )
      .single();

    if (error) throw error;

    return NextResponse.json({ session: data }, { status: 201 });
  } catch (error) {
    console.error('Error creating time tracking session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
