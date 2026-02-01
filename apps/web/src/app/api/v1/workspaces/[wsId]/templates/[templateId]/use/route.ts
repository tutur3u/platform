import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';

interface UseTemplateRequest {
  boardName: string;
}

interface Params {
  params: Promise<{
    wsId: string;
    templateId: string;
  }>;
}

// Priority is an enum: 'low' | 'normal' | 'high' | 'critical'
type TaskPriority = 'low' | 'normal' | 'high' | 'critical' | null;
type ListStatus = 'active' | 'closed' | 'documents' | 'done' | 'not_started';
type EstimationType = 'exponential' | 'fibonacci' | 'linear' | 't-shirt';

const VALID_ESTIMATION_TYPES: EstimationType[] = [
  'exponential',
  'fibonacci',
  'linear',
  't-shirt',
];

function isValidEstimationType(type: string): type is EstimationType {
  return VALID_ESTIMATION_TYPES.includes(type as EstimationType);
}

interface TemplateTask {
  name: string;
  description: string | null;
  priority: TaskPriority;
  completed: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

interface TemplateList {
  name: string;
  status: string;
  color: string | null;
  position: number | null;
  archived: boolean;
  tasks: TemplateTask[];
}

interface TemplateContent {
  lists: TemplateList[];
  labels: Array<{ name: string; color: string }>;
  settings: {
    estimation_type?: string | null;
    allow_zero_estimates?: boolean | null;
    extended_estimation?: boolean | null;
  };
}

// Valid list statuses for the database
const VALID_LIST_STATUSES: ListStatus[] = [
  'active',
  'closed',
  'documents',
  'done',
  'not_started',
];

function isValidListStatus(status: string): status is ListStatus {
  return VALID_LIST_STATUSES.includes(status as ListStatus);
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { wsId, templateId } = await params;
    const body: UseTemplateRequest = await req.json();

    const { boardName } = body;

    if (!boardName || boardName.trim().length === 0) {
      return NextResponse.json(
        { error: 'Board name is required' },
        { status: 400 }
      );
    }

    if (!validate(wsId) || !validate(templateId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID or template ID' },
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
        { error: 'Please sign in to use templates' },
        { status: 401 }
      );
    }

    // Verify user has access to the target workspace
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

    // Fetch the template (RLS will handle access control via is_board_template_accessible)
    const { data: template, error: fetchError } = await supabase
      .from('board_templates')
      .select('id, name, content, visibility, ws_id, created_by')
      .eq('id', templateId)
      .single();

    if (fetchError || !template) {
      console.error('Failed to fetch template:', fetchError);
      return NextResponse.json(
        { error: 'Template not found or access denied' },
        { status: 404 }
      );
    }

    const content = template.content as unknown as TemplateContent;

    // Validate content structure
    if (!content || !content.lists) {
      return NextResponse.json(
        { error: 'Invalid template content' },
        { status: 400 }
      );
    }

    // Validate estimation type from template
    const rawEstimationType = content.settings?.estimation_type;
    const estimationType: EstimationType | null =
      rawEstimationType && isValidEstimationType(rawEstimationType)
        ? rawEstimationType
        : null;

    // Create the new board in the target workspace
    const { data: createdBoard, error: boardError } = await supabase
      .from('workspace_boards')
      .insert({
        name: boardName.trim(),
        ws_id: wsId,
        creator_id: user.id,
        estimation_type: estimationType,
        allow_zero_estimates: content.settings?.allow_zero_estimates ?? true,
        extended_estimation: content.settings?.extended_estimation ?? false,
      })
      .select('id')
      .single();

    if (boardError || !createdBoard) {
      console.error('Failed to create board:', boardError);
      return NextResponse.json(
        { error: 'Failed to create board' },
        { status: 500 }
      );
    }

    const newBoardId = createdBoard.id;

    // Delete any auto-created lists (some boards have default lists from triggers)
    const { error: deleteError } = await supabase
      .from('task_lists')
      .delete()
      .eq('board_id', newBoardId);

    if (deleteError) {
      console.warn(
        'Warning: Could not delete auto-created lists:',
        deleteError
      );
    }

    // Create workspace labels if they don't exist
    // Note: Labels are workspace-scoped, so we'll check for existing labels first
    let labelsCreatedCount = 0;
    if (content.labels && content.labels.length > 0) {
      // Get existing workspace labels
      const { data: existingLabels } = await supabase
        .from('workspace_task_labels')
        .select('name')
        .eq('ws_id', wsId);

      const existingLabelNames = new Set(
        (existingLabels || []).map((l) => l.name.toLowerCase())
      );

      // Only create labels that don't already exist
      const labelsToCreate = content.labels
        .filter((label) => !existingLabelNames.has(label.name.toLowerCase()))
        .map((label) => ({
          ws_id: wsId,
          name: label.name,
          color: label.color,
          creator_id: user.id,
        }));

      if (labelsToCreate.length > 0) {
        const { data: createdLabels, error: labelsError } = await supabase
          .from('workspace_task_labels')
          .insert(labelsToCreate)
          .select('id');

        if (labelsError) {
          console.warn('Warning: Could not create labels:', labelsError);
        } else {
          labelsCreatedCount = createdLabels?.length || 0;
        }
      }
    }

    // Create task lists
    let totalListsCreated = 0;
    let totalTasksCreated = 0;

    if (content.lists && content.lists.length > 0) {
      // Handle database constraint: only one closed list is allowed per board
      let hasClosedList = false;
      const listsToCreate = content.lists.map((list, index) => {
        let status: ListStatus = isValidListStatus(list.status)
          ? list.status
          : 'active';

        // If this is a closed list but we already have one, convert it to 'done' status
        if (status === 'closed') {
          if (hasClosedList) {
            status = 'done';
          } else {
            hasClosedList = true;
          }
        }

        return {
          name: list.name,
          board_id: newBoardId,
          creator_id: user.id,
          status,
          color: list.color,
          position: list.position ?? index,
          archived: list.archived || false,
          deleted: false,
        };
      });

      const { data: createdLists, error: listsError } = await supabase
        .from('task_lists')
        .insert(listsToCreate)
        .select('id, name');

      if (listsError || !createdLists) {
        console.error('List creation error:', listsError);
        // Don't fail the whole operation, board is created
      } else {
        totalListsCreated = createdLists.length;

        // Create a mapping from list names to new list IDs
        const listIdMap = new Map<string, string>();
        createdLists.forEach((list) => {
          listIdMap.set(list.name || '', list.id);
        });

        // Copy tasks for each list
        const allTasksToCreate: Array<{
          name: string;
          description: string | null;
          list_id: string;
          priority: TaskPriority;
          start_date: string | null;
          end_date: string | null;
          completed: boolean;
          creator_id: string;
        }> = [];

        for (const originalList of content.lists) {
          if (!originalList.tasks || originalList.tasks.length === 0) {
            continue;
          }

          const newListId = listIdMap.get(originalList.name);
          if (!newListId) {
            continue;
          }

          const tasksToCreate = originalList.tasks.map((task) => ({
            name: task.name,
            description: task.description || null,
            list_id: newListId,
            priority: task.priority || null,
            start_date: task.start_date || null,
            end_date: task.end_date || null,
            completed: task.completed || false,
            creator_id: user.id,
          }));

          allTasksToCreate.push(...tasksToCreate);
        }

        // Insert all tasks at once
        if (allTasksToCreate.length > 0) {
          const { data: createdTasks, error: tasksError } = await supabase
            .from('tasks')
            .insert(allTasksToCreate)
            .select('id');

          if (tasksError) {
            console.error('Task insertion error:', tasksError);
          } else {
            totalTasksCreated = createdTasks?.length || 0;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Board created from template successfully',
      board: {
        id: newBoardId,
        name: boardName.trim(),
      },
      stats: {
        listsCreated: totalListsCreated,
        tasksCreated: totalTasksCreated,
        labelsCreated: labelsCreatedCount,
      },
    });
  } catch (error) {
    console.error('Error using template:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
