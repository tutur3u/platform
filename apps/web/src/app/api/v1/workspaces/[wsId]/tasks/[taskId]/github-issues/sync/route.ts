import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

interface RouteParams {
  params: Promise<{
    wsId: string;
    taskId: string;
  }>;
}

// Helper function to get authenticated Octokit instance
async function getOctokit() {
  const appId = process.env.NEXT_PUBLIC_GITHUB_APP_ID;
  const privateKey = process.env.NEXT_PUBLIC_GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.NEXT_PUBLIC_GITHUB_APP_INSTALLATION_ID;

  if (!appId || !privateKey || !installationId) {
    throw new Error('GitHub App credentials not configured');
  }

  const auth = createAppAuth({
    appId,
    privateKey: Buffer.from(privateKey, 'base64').toString('utf-8'),
    installationId: Number(installationId),
  });

  const { token } = await auth({ type: 'installation' });
  return new Octokit({ auth: token });
}

// POST - Sync GitHub issue data from GitHub API
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId, taskId } = await params;
    const body = await request.json();
    const { issue_id } = body;

    if (!issue_id) {
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

    // Check workspace membership
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify task exists and belongs to workspace
    const { data: task } = await supabase
      .from('tasks')
      .select(`
        id,
        task_lists!inner(
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
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Get the GitHub issue link
    const { data: githubIssue } = await supabase
      .from('task_github_issues')
      .select('*')
      .eq('id', issue_id)
      .eq('task_id', taskId)
      .single();

    if (!githubIssue) {
      return NextResponse.json(
        { error: 'GitHub issue link not found' },
        { status: 404 }
      );
    }

    // Fetch data from GitHub API
    try {
      const octokit = await getOctokit();
      const { data: issueData } = await octokit.issues.get({
        owner: githubIssue.owner,
        repo: githubIssue.repo,
        issue_number: githubIssue.issue_number,
      });

      // Update the GitHub issue link with fresh data
      const { data: updatedIssue, error: updateError } = await supabase
        .from('task_github_issues')
        .update({
          github_state: issueData.state,
          github_title: issueData.title,
          github_url: issueData.html_url,
          github_labels: issueData.labels.map((label) =>
            typeof label === 'string' ? label : label.name
          ),
          github_assignees: issueData.assignees?.map((a) => a.login) || [],
          github_created_at: issueData.created_at,
          github_updated_at: issueData.updated_at,
          github_closed_at: issueData.closed_at,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', issue_id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating GitHub issue:', updateError);
        return NextResponse.json(
          { error: 'Failed to update GitHub issue data' },
          { status: 500 }
        );
      }

      return NextResponse.json(updatedIssue);
    } catch (githubError: any) {
      console.error('GitHub API error:', githubError);

      // Handle specific GitHub API errors
      if (githubError.status === 404) {
        return NextResponse.json(
          { error: 'GitHub issue not found or access denied' },
          { status: 404 }
        );
      }

      if (githubError.status === 401 || githubError.status === 403) {
        return NextResponse.json(
          { error: 'GitHub API authentication failed' },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to fetch data from GitHub API' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
