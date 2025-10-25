import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{
    wsId: string;
    taskId: string;
  }>;
}

// Zod schemas for validation
const createGitHubIssueSchema = z.object({
  owner: z.string().min(1, 'Owner is required'),
  repo: z.string().min(1, 'Repository is required'),
  issue_number: z
    .number()
    .int()
    .positive('Issue number must be a positive integer'),
  github_url: z.string().url('Invalid GitHub URL'),
  github_title: z.string().optional(),
  github_state: z.enum(['open', 'closed']).optional(),
  github_labels: z.array(z.string()).optional(),
  github_assignees: z.array(z.string()).optional(),
  github_created_at: z.string().optional(),
  github_updated_at: z.string().optional(),
  github_closed_at: z.string().optional().nullable(),
});

// Helper function to verify task access
async function verifyTaskAccess(
  supabase: ReturnType<Awaited<typeof createClient>>,
  taskId: string,
  wsId: string,
  userId: string
) {
  // Check workspace membership
  const { data: workspaceMember } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .single();

  if (!workspaceMember) {
    return { error: 'Access denied', status: 403 };
  }

  // Verify task exists and belongs to workspace
  const { data: task } = await supabase
    .from('tasks')
    .select(`
      id,
      list_id,
      task_lists!inner(
        board_id,
        workspace_boards!inner(
          ws_id
        )
      )
    `)
    .eq('id', taskId)
    .eq('task_lists.workspace_boards.ws_id', wsId)
    .is('deleted_at', null)
    .single();

  if (!task) {
    return { error: 'Task not found', status: 404 };
  }

  return { task };
}

// GET - Fetch all GitHub issues linked to a task
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId, taskId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify access
    const accessCheck = await verifyTaskAccess(supabase, taskId, wsId, user.id);
    if ('error' in accessCheck) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: accessCheck.status }
      );
    }

    // Fetch GitHub issues for this task
    const { data: githubIssues, error } = await supabase
      .from('task_github_issues')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching GitHub issues:', error);
      return NextResponse.json(
        { error: 'Failed to fetch GitHub issues' },
        { status: 500 }
      );
    }

    return NextResponse.json(githubIssues || []);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Link a GitHub issue to a task
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId, taskId } = await params;
    const body = await request.json();

    // Validate input
    const validationResult = createGitHubIssueSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const data = validationResult.data;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify access
    const accessCheck = await verifyTaskAccess(supabase, taskId, wsId, user.id);
    if ('error' in accessCheck) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: accessCheck.status }
      );
    }

    // Check if this GitHub issue is already linked to this task
    const { data: existingLink } = await supabase
      .from('task_github_issues')
      .select('id')
      .eq('task_id', taskId)
      .eq('owner', data.owner)
      .eq('repo', data.repo)
      .eq('issue_number', data.issue_number)
      .single();

    if (existingLink) {
      return NextResponse.json(
        { error: 'This GitHub issue is already linked to this task' },
        { status: 409 }
      );
    }

    // Create the GitHub issue link
    const { data: githubIssue, error: insertError } = await supabase
      .from('task_github_issues')
      .insert({
        task_id: taskId,
        owner: data.owner,
        repo: data.repo,
        issue_number: data.issue_number,
        github_url: data.github_url,
        github_title: data.github_title,
        github_state: data.github_state,
        github_labels: data.github_labels,
        github_assignees: data.github_assignees,
        github_created_at: data.github_created_at,
        github_updated_at: data.github_updated_at,
        github_closed_at: data.github_closed_at,
        creator_id: user.id,
        synced_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating GitHub issue link:', insertError);
      return NextResponse.json(
        { error: 'Failed to link GitHub issue' },
        { status: 500 }
      );
    }

    return NextResponse.json(githubIssue, { status: 201 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a GitHub issue link from a task
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId, taskId } = await params;
    const { searchParams } = new URL(request.url);
    const issueId = searchParams.get('issue_id');

    if (!issueId) {
      return NextResponse.json(
        { error: 'GitHub issue ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify access
    const accessCheck = await verifyTaskAccess(supabase, taskId, wsId, user.id);
    if ('error' in accessCheck) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: accessCheck.status }
      );
    }

    // Remove the GitHub issue link
    const { error: deleteError } = await supabase
      .from('task_github_issues')
      .delete()
      .eq('id', issueId)
      .eq('task_id', taskId);

    if (deleteError) {
      console.error('Error removing GitHub issue link:', deleteError);
      return NextResponse.json(
        { error: 'Failed to remove GitHub issue link' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
