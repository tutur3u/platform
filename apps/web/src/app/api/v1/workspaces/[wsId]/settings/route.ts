import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

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

    // Fetch workspace info to check if it's personal
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('personal')
      .eq('id', wsId)
      .maybeSingle();

    // Fetch workspace settings
    const { data: settings, error } = await supabase
      .from('workspace_settings')
      .select('*')
      .eq('ws_id', wsId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching workspace settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch workspace settings' },
        { status: 500 }
      );
    }

    // For personal workspaces, always return null for missed_entry_date_threshold
    // This disables all time tracking request/threshold flows for personal workspaces
    if (workspace?.personal) {
      return NextResponse.json({
        ...settings,
        missed_entry_date_threshold: null,
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error in workspace settings API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
