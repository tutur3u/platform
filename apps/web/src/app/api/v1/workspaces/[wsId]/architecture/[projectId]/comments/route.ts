import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    wsId: string;
    projectId: string;
  };
}

// Get all comments for a project
export async function GET(request: Request, { params }: Params) {
  const { wsId, projectId } = params;
  const supabase = await createClient();

  try {
    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has access to the workspace
    const { data: memberData, error: memberError } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (memberError || !memberData) {
      return NextResponse.json(
        { message: 'You do not have access to this workspace' },
        { status: 403 }
      );
    }

    // Get comments with user information
    const { data, error } = await supabase
      .from('architecture_project_comments')
      .select(
        `
        *,
        profiles:user_id (
          full_name,
          avatar_url
        )
      `
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching comments:', error);
      return NextResponse.json(
        { message: 'Error fetching comments' },
        { status: 500 }
      );
    }

    // Format the comments to include user details
    const formattedComments = data.map((comment) => ({
      ...comment,
      user_name: comment.profiles?.full_name,
      user_avatar_url: comment.profiles?.avatar_url,
    }));

    return NextResponse.json(formattedComments);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { message: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

// Add a new comment to a project
export async function POST(request: Request, { params }: Params) {
  const { wsId, projectId } = params;
  const supabase = await createClient();

  try {
    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has access to the workspace
    const { data: memberData, error: memberError } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (memberError || !memberData) {
      return NextResponse.json(
        { message: 'You do not have access to this workspace' },
        { status: 403 }
      );
    }

    // Check if the project exists and belongs to the workspace
    const { data: projectData, error: projectError } = await supabase
      .from('workspace_architecture_projects')
      .select('*')
      .eq('id', projectId)
      .eq('ws_id', wsId)
      .single();

    if (projectError || !projectData) {
      return NextResponse.json(
        { message: 'Project not found' },
        { status: 404 }
      );
    }

    // Get the content from the request body
    const { content } = await request.json();

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return NextResponse.json(
        { message: 'Comment content is required' },
        { status: 400 }
      );
    }

    // Insert the new comment
    const { data, error } = await supabase
      .from('architecture_project_comments')
      .insert({
        project_id: projectId,
        user_id: user.id,
        content: content.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating comment:', error);
      return NextResponse.json(
        { message: 'Error creating comment' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { message: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
