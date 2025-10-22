import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Type definitions for update responses
interface User {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Reaction {
  id: string;
  emoji: string;
  user_id: string;
  created_at: string;
  user: User;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  parent_id: string | null;
  deleted_at: string | null;
  user: User;
}

interface Attachment {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
  uploaded_by: string;
  uploader: User;
}

interface ReactionGroup {
  emoji: string;
  count: number;
  users: User[];
  userReacted: boolean;
}

interface UpdateWithRelations {
  id: string;
  project_id: string;
  creator_id: string;
  content: string;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  creator: User;
  reactions?: Reaction[];
  comments?: Comment[];
  attachments?: Attachment[];
}

interface MappedUpdate
  extends Omit<UpdateWithRelations, 'reactions' | 'comments'> {
  reactionGroups: ReactionGroup[];
  commentsCount: number;
  attachmentsCount: number;
}

const createUpdateSchema = z.object({
  content: z.string(), // Plain text (TipTap handles JSONContent conversion)
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; projectId: string }> }
) {
  try {
    const { wsId, projectId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify project exists and belongs to workspace
    const { data: project } = await supabase
      .from('task_projects')
      .select('id')
      .eq('id', projectId)
      .eq('ws_id', wsId)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Parse and validate request body
    const body = await request.json();
    const { content } = createUpdateSchema.parse(body);

    // Create update
    const { data: newUpdate, error: createError } = await supabase
      .from('task_project_updates')
      .insert({
        project_id: projectId,
        creator_id: user.id,
        content,
      })
      .select(
        `
        *,
        creator:users!task_project_updates_creator_id_fkey(
          id,
          display_name,
          avatar_url
        )
      `
      )
      .single();

    if (createError) {
      console.error('Error creating project update:', createError);
      return NextResponse.json(
        { error: 'Failed to create update' },
        { status: 500 }
      );
    }

    return NextResponse.json(newUpdate, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'Error in POST /api/v1/workspaces/[wsId]/task-projects/[projectId]/updates:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; projectId: string }> }
) {
  try {
    const { wsId, projectId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Fetch updates with reactions, comments, and attachments
    const { data: updates, error: fetchError } = await supabase
      .from('task_project_updates')
      .select(
        `
        *,
        creator:users!task_project_updates_creator_id_fkey(
          id,
          display_name,
          avatar_url
        ),
        reactions:task_project_update_reactions(
          id,
          emoji,
          user_id,
          created_at,
          user:users(
            id,
            display_name,
            avatar_url
          )
        ),
        comments:task_project_update_comments(
          id,
          content,
          created_at,
          updated_at,
          user_id,
          parent_id,
          deleted_at,
          user:users(
            id,
            display_name,
            avatar_url
          )
        ),
        attachments:task_project_update_attachments(
          id,
          file_name,
          file_path,
          file_size,
          mime_type,
          created_at,
          uploaded_by,
          uploader:users!task_project_update_attachments_uploaded_by_fkey(
            id,
            display_name,
            avatar_url
          )
        )
      `
      )
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (fetchError) {
      console.error('Error fetching project updates:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch updates' },
        { status: 500 }
      );
    }

    // Group reactions by emoji with counts
    const updatesWithGroupedReactions: MappedUpdate[] =
      (updates as UpdateWithRelations[] | null)?.map((update) => {
        const reactionGroups: Record<string, ReactionGroup> = {};

        update.reactions?.forEach((reaction) => {
          if (!reactionGroups[reaction.emoji]) {
            reactionGroups[reaction.emoji] = {
              emoji: reaction.emoji,
              count: 0,
              users: [],
              userReacted: false,
            };
          }

          if (reactionGroups[reaction.emoji] === undefined) return;
          reactionGroups[reaction.emoji]!.count++;
          reactionGroups[reaction.emoji]!.users.push(reaction.user);
          if (reaction.user_id === user.id)
            reactionGroups[reaction.emoji]!.userReacted = true;
        });

        return {
          ...update,
          reactionGroups: Object.values(reactionGroups),
          commentsCount:
            update.comments?.filter((c) => !c.deleted_at).length || 0,
          attachmentsCount: update.attachments?.length || 0,
        };
      }) || [];

    return NextResponse.json({
      updates: updatesWithGroupedReactions,
      hasMore: (updates?.length || 0) === limit,
    });
  } catch (error) {
    console.error(
      'Error in GET /api/v1/workspaces/[wsId]/task-projects/[projectId]/updates:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
