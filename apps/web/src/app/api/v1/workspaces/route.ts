import { createClient } from '@tuturuuu/supabase/next/server';
import { MAX_WORKSPACES_FOR_FREE_USERS } from '@tuturuuu/utils/constants';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
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
      .select('id, name, personal, workspace_members!inner(role)')
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

  // Check workspace creation limits for non-Tuturuuu emails
  if (!isValidTuturuuuEmail(user.email)) {
    // Count workspaces created by this user
    const { count, error: countError } = await supabase
      .from('workspaces')
      .select('*', { count: 'exact', head: true })
      .eq('creator_id', user.id)
      .eq('deleted', false);

    if (countError) {
      console.error('Error counting workspaces:', countError);
      return NextResponse.json(
        { message: 'Error checking workspace limit' },
        { status: 500 }
      );
    }

    if (count !== null && count >= MAX_WORKSPACES_FOR_FREE_USERS) {
      return NextResponse.json(
        {
          message: `You have reached the maximum limit of ${MAX_WORKSPACES_FOR_FREE_USERS} workspaces. Please upgrade to a paid plan or contact the Tuturuuu team for more information.`,
          code: 'WORKSPACE_LIMIT_REACHED',
        },
        { status: 403 }
      );
    }
  }

  const { name } = await req.json();

  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      name,
      creator_id: user.id,
    })
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
