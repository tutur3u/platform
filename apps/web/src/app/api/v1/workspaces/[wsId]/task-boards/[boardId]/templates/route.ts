import { createClient } from '@tuturuuu/supabase/next/server';
import type { Json } from '@tuturuuu/types/supabase';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';

interface SaveTemplateRequest {
  name: string;
  description?: string;
  visibility?: 'private' | 'workspace' | 'public';
  includeTasks?: boolean;
  includeLabels?: boolean;
  includeDates?: boolean;
}

interface Params {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

// Priority is an enum: 'low' | 'normal' | 'high' | 'critical'
type TaskPriority = 'low' | 'normal' | 'high' | 'critical' | null;

interface SanitizedTask {
  name: string;
  description: string | null;
  priority: TaskPriority;
  completed: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

interface SanitizedList {
  name: string;
  status: string;
  color: string | null;
  position: number | null;
  archived: boolean;
  tasks: SanitizedTask[];
}

interface TemplateContent {
  lists: SanitizedList[];
  labels: Array<{ name: string; color: string }>;
  settings: {
    estimation_type?: string | null;
    allow_zero_estimates?: boolean | null;
    extended_estimation?: boolean | null;
  };
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { wsId, boardId } = await params;
    const body: SaveTemplateRequest = await req.json();

    const {
      name,
      description,
      visibility = 'private',
      includeTasks = true,
      includeLabels = true,
      includeDates = true,
    } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Template name is required' },
        { status: 400 }
      );
    }

    if (!validate(wsId) || !validate(boardId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID or board ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to save templates' },
        { status: 401 }
      );
    }

    // Verify user has access to the workspace
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    // Fetch the source board with lists and tasks
    const { data: sourceBoard, error: fetchError } = await supabase
      .from('workspace_boards')
      .select(
        `
        id,
        name,
        estimation_type,
        allow_zero_estimates,
        extended_estimation,
        task_lists!board_id (
          id,
          name,
          archived,
          deleted,
          status,
          color,
          position,
          tasks!list_id (
            id,
            name,
            description,
            completed,
            priority,
            start_date,
            end_date,
            deleted_at
          )
        )
      `
      )
      .eq('id', boardId)
      .eq('ws_id', wsId)
      .is('deleted_at', null)
      .single();

    if (fetchError || !sourceBoard) {
      console.error('Failed to fetch source board:', fetchError);
      return NextResponse.json(
        { error: 'Board not found or access denied' },
        { status: 404 }
      );
    }

    // Fetch workspace labels if requested
    // Labels in this system are workspace-scoped (workspace_task_labels)
    let labels: Array<{ name: string; color: string }> = [];
    if (includeLabels) {
      const { data: workspaceLabels } = await supabase
        .from('workspace_task_labels')
        .select('name, color')
        .eq('ws_id', wsId);

      labels = (workspaceLabels || []).map((label) => ({
        name: label.name,
        color: label.color,
      }));
    }

    // Sanitize and transform board data for storage
    const taskLists = sourceBoard.task_lists || [];
    const sanitizedLists: SanitizedList[] = taskLists
      .filter((list) => !list.deleted)
      .map((list) => {
        const tasks = (list.tasks || []) as Array<{
          id: string;
          name: string | null;
          description: string | null;
          completed: boolean | null;
          priority: TaskPriority;
          start_date: string | null;
          end_date: string | null;
          deleted_at: string | null;
        }>;

        const sanitizedTasks: SanitizedTask[] = includeTasks
          ? tasks
              .filter((task) => !task.deleted_at)
              .map((task) => {
                const sanitizedTask: SanitizedTask = {
                  name: task.name || '',
                  description: task.description,
                  priority: task.priority,
                  completed: task.completed || false,
                };

                // Only include dates if requested
                if (includeDates) {
                  sanitizedTask.start_date = task.start_date;
                  sanitizedTask.end_date = task.end_date;
                }

                return sanitizedTask;
              })
          : [];

        return {
          name: list.name || '',
          status: list.status || 'active',
          color: list.color,
          position: list.position,
          archived: list.archived || false,
          tasks: sanitizedTasks,
        };
      });

    const content: TemplateContent = {
      lists: sanitizedLists,
      labels,
      settings: {
        estimation_type: sourceBoard.estimation_type,
        allow_zero_estimates: sourceBoard.allow_zero_estimates,
        extended_estimation: sourceBoard.extended_estimation,
      },
    };

    // Insert the template
    const { error: insertError } = await supabase
      .from('board_templates')
      .insert({
        ws_id: wsId,
        created_by: user.id,
        source_board_id: boardId,
        name: name.trim(),
        description: description?.trim() || null,
        visibility,
        content: content as unknown as Json,
      });

    if (insertError) {
      console.error('Failed to create template:', insertError);
      return NextResponse.json(
        { error: 'Failed to create template' },
        { status: 500 }
      );
    }

    // Count statistics
    const totalLists = sanitizedLists.length;
    const totalTasks = sanitizedLists.reduce(
      (acc, list) => acc + list.tasks.length,
      0
    );
    const totalLabels = labels.length;

    return NextResponse.json({
      success: true,
      message: 'Template saved successfully',
      stats: {
        lists: totalLists,
        tasks: includeTasks ? totalTasks : 0,
        labels: includeLabels ? totalLabels : 0,
      },
    });
  } catch (error) {
    console.error('Error saving template:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
