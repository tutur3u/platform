import { createClient } from '@tuturuuu/supabase/next/server';
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

    // Get session templates using the database function
    const { data, error } = await supabase.rpc('get_session_templates', {
      workspace_id: wsId,
      user_id_param: user.id,
      limit_count: 10,
    });

    if (error) throw error;

    // Transform the data to match the expected format
    const templates =
      data?.map((template: any) => ({
        title: template.title,
        description: template.description,
        category_id: template.category_id,
        task_id: template.task_id,
        tags: template.tags,
        category: template.category_name
          ? {
              id: template.category_id,
              name: template.category_name,
              color: template.category_color,
            }
          : null,
        task: template.task_name
          ? {
              id: template.task_id,
              name: template.task_name,
            }
          : null,
        usage_count: template.usage_count,
        avg_duration: template.avg_duration,
        last_used: template.last_used,
      })) || [];

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error fetching session templates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
