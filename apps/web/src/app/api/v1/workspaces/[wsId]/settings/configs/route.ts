import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

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
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const ids = searchParams.get('ids')?.split(',') || [];

    if (ids.length === 0) {
      return NextResponse.json({});
    }

    // Fetch workspace configurations
    const { data: configs, error } = await sbAdmin
      .from('workspace_configs')
      .select('id, value')
      .eq('ws_id', wsId)
      .in('id', ids);

    if (error) {
      console.error('Error fetching workspace configs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch workspace configs' },
        { status: 500 }
      );
    }

    const result: Record<string, string | null> = {};
    for (const id of ids) {
      result[id] = configs.find((c) => c.id === id)?.value || null;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in workspace configs API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

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
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const updates: Record<string, string> = await req.json();
    const updateEntries = Object.entries(updates);

    if (updateEntries.length === 0) {
      return NextResponse.json({ message: 'No updates provided' });
    }

    // Perform batch upsert
    const { error } = await sbAdmin.from('workspace_configs').upsert(
      updateEntries.map(([id, value]) => ({
        id,
        ws_id: wsId,
        value: value || '',
        updated_at: new Date().toISOString(),
      }))
    );

    if (error) {
      console.error('Error batch updating workspace configs:', error);
      return NextResponse.json(
        { error: 'Failed to update workspace configs' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  } catch (error) {
    console.error('Error in workspace configs API (PUT):', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
