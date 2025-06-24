import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  _: NextRequest,
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

    // For now, return templates based on recent sessions
    // In the future, this could be a separate table for saved templates
    const { data: recentSessions } = await supabase
      .from('time_tracking_sessions')
      .select(
        `
        title,
        description,
        category_id,
        task_id,
        category:time_tracking_categories(*),
        task:tasks(*)
      `
      )
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .eq('is_running', false)
      .not('duration_seconds', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    // Group by similar sessions to create templates
    const templateMap = new Map();

    recentSessions?.forEach((session) => {
      const key = `${session.title}-${session.category_id}-${session.task_id}`;
      if (templateMap.has(key)) {
        templateMap.get(key).usage_count++;
      } else {
        templateMap.set(key, {
          title: session.title,
          description: session.description,
          category_id: session.category_id,
          task_id: session.task_id,
          category: session.category,
          task: session.task,
          usage_count: 1,
        });
      }
    });

    // Convert to array and sort by usage
    const templates = Array.from(templateMap.values())
      .sort((a, b) => b.usage_count - a.usage_count)
      .slice(0, 5); // Top 5 templates

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error fetching time tracking templates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
