import { createClient } from '@tuturuuu/supabase/next/server';
import { checkWorkspaceCreationLimit } from '@tuturuuu/utils/workspace-limits';
import { NextResponse } from 'next/server';

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

    // Get all workspaces the user has access to
    const { data: workspaces, error } = await supabase
      .from('workspaces')
      .select('id, name, slug, personal, workspace_members!inner(role)')
      .eq('workspace_members.user_id', user.id)
      .order('name');

    if (error) {
      console.error('Error fetching workspaces:', error);
      return NextResponse.json(
        { error: 'Failed to fetch workspaces' },
        { status: 500 }
      );
    }

    // Transform data to include role information
    const transformedWorkspaces = workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      personal: ws.personal,
      role: ws.workspace_members[0]?.role,
    }));

    return NextResponse.json(transformedWorkspaces);
  } catch (error) {
    console.error('Error in workspaces API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  // Check workspace creation limits
  const limitCheck = await checkWorkspaceCreationLimit(
    supabase,
    user.id,
    user.email
  );

  if (!limitCheck.canCreate) {
    const statusCode =
      limitCheck.errorCode === 'WORKSPACE_COUNT_ERROR' ? 500 : 403;
    return NextResponse.json(
      {
        message: limitCheck.errorMessage,
        code: limitCheck.errorCode,
      },
      { status: statusCode }
    );
  }

  const { name, slug } = await req.json();

  // Build insert object
  const insertData: { name?: string; slug?: string; creator_id: string } = {
    creator_id: user.id,
  };
  if (name !== undefined) insertData.name = name;
  if (slug !== undefined) insertData.slug = slug;

  const { data, error } = await supabase
    .from('workspaces')
    .insert(insertData)
    .select('id')
    .single();

  console.log(data, error);

  if (error)
    return NextResponse.json(
      { message: 'Error creating workspace' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success', id: data.id });
}
