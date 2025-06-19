import { createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const supabase = await createClient();
    const { wsId } = await params;

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { workspaceName, message } = body;

    // Validate required fields
    if (!workspaceName?.trim() || !message?.trim()) {
      return NextResponse.json(
        { error: 'Workspace name and message are required' },
        { status: 400 }
      );
    }

    // Verify user is workspace owner
    const { data: memberCheck, error: memberError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (memberError || !memberCheck) {
      return NextResponse.json(
        { error: 'Workspace not found or access denied' },
        { status: 403 }
      );
    }

    if (memberCheck.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Only workspace owners can request education access' },
        { status: 403 }
      );
    }

    // Check if education is already enabled
    const { data: educationSecret } = await supabase
      .from('workspace_secrets')
      .select('value')
      .eq('ws_id', wsId)
      .eq('name', 'ENABLE_EDUCATION')
      .single();

    if (educationSecret?.value === 'true') {
      return NextResponse.json(
        { error: 'Education features are already enabled for this workspace' },
        { status: 400 }
      );
    }

    // Check for existing pending request
    const { data: existingRequest, error: existingError } = await supabase
      .from('workspace_education_access_requests')
      .select('id, status')
      .eq('ws_id', wsId)
      .eq('status', 'pending')
      .single();

    if (existingRequest && !existingError) {
      return NextResponse.json(
        {
          error:
            'A pending education access request already exists for this workspace',
        },
        { status: 400 }
      );
    }

    // Create the education access request
    const { data: newRequest, error: insertError } = await supabase
      .from('workspace_education_access_requests')
      .insert({
        ws_id: wsId,
        workspace_name: workspaceName.trim(),
        creator_id: user.id,
        message: message.trim(),
        status: 'pending',
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('Database error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create education access request' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: 'Education access request submitted successfully',
        request: newRequest,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const supabase = await createClient();
    const { wsId } = await params;

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to this workspace
    const { data: memberCheck, error: memberError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (memberError || !memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    // Get education access request for this workspace
    const { data: request, error: requestError } = await supabase
      .from('workspace_education_access_requests')
      .select('*')
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (requestError) {
      // If no request found, return null
      if (requestError.code === 'PGRST116') {
        return NextResponse.json({ request: null });
      }

      console.error('Database error:', requestError);
      return NextResponse.json(
        { error: 'Failed to fetch education access request' },
        { status: 500 }
      );
    }

    return NextResponse.json({ request });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
