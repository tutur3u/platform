import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  BOARD_TEMPLATES_APP_SESSION_AUTH,
  createBoardTemplatesRouteContext,
  fetchAccessibleBoardTemplate,
  handleTemplateRouteError,
  invalidTemplateIdResponse,
  parseTemplateId,
} from '../../_lib';

type Params = {
  templateId: string;
  wsId: string;
};

type UseTemplateRequest = {
  boardName: string;
};

type TaskPriority = 'low' | 'normal' | 'high' | 'critical' | null;
type ListStatus =
  | 'active'
  | 'closed'
  | 'documents'
  | 'done'
  | 'not_started'
  | 'review';
type EstimationType = 'exponential' | 'fibonacci' | 'linear' | 't-shirt';

type TemplateTask = {
  completed: boolean;
  description: string | null;
  end_date?: string | null;
  name: string;
  priority: TaskPriority;
  start_date?: string | null;
};

type TemplateList = {
  archived: boolean;
  color: string | null;
  name: string;
  position: number | null;
  status: string;
  tasks: TemplateTask[];
};

type TemplateContent = {
  labels: Array<{ color: string; name: string }>;
  lists: TemplateList[];
  settings: {
    allow_zero_estimates?: boolean | null;
    estimation_type?: string | null;
    extended_estimation?: boolean | null;
  };
};

const TASK_BOARD_NAME_EXISTS_CODE = 'TASK_BOARD_NAME_EXISTS';
const TASK_BOARD_NAME_EXISTS_ERROR =
  'A task board with this name already exists';

const VALID_ESTIMATION_TYPES: EstimationType[] = [
  'exponential',
  'fibonacci',
  'linear',
  't-shirt',
];

const VALID_LIST_STATUSES: ListStatus[] = [
  'active',
  'closed',
  'documents',
  'done',
  'not_started',
  'review',
];

function isUniqueViolation(error: unknown) {
  return (
    error !== null &&
    error !== undefined &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '23505'
  );
}

function taskBoardNameExistsResponse() {
  return NextResponse.json(
    {
      code: TASK_BOARD_NAME_EXISTS_CODE,
      error: TASK_BOARD_NAME_EXISTS_ERROR,
    },
    { status: 409 }
  );
}

function isValidEstimationType(type: string): type is EstimationType {
  return VALID_ESTIMATION_TYPES.includes(type as EstimationType);
}

function isValidListStatus(status: string): status is ListStatus {
  return VALID_LIST_STATUSES.includes(status as ListStatus);
}

export const POST = withSessionAuth<Params>(
  async (request: NextRequest, auth, { templateId, wsId: rawWsId }) => {
    try {
      if (!parseTemplateId(templateId)) return invalidTemplateIdResponse();

      const { boardName } = (await request.json()) as UseTemplateRequest;
      if (!boardName || boardName.trim().length === 0) {
        return NextResponse.json(
          { error: 'Board name is required' },
          { status: 400 }
        );
      }

      const context = await createBoardTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const permissions = await getPermissions({
        user: context.user,
        wsId: context.wsId,
      });
      if (!permissions?.containsPermission('manage_projects')) {
        return NextResponse.json(
          { error: "You don't have permission to create boards" },
          { status: 403 }
        );
      }

      const { response, template } = await fetchAccessibleBoardTemplate(
        context,
        templateId
      );
      if (response) return response;

      const content = template.content as unknown as TemplateContent;
      if (!content?.lists) {
        return NextResponse.json(
          { error: 'Invalid template content' },
          { status: 400 }
        );
      }

      const rawEstimationType = content.settings?.estimation_type;
      const estimationType: EstimationType | null =
        rawEstimationType && isValidEstimationType(rawEstimationType)
          ? rawEstimationType
          : null;

      const { data: createdBoard, error: boardError } = await context.sbAdmin
        .from('workspace_boards')
        .insert({
          allow_zero_estimates: content.settings?.allow_zero_estimates ?? true,
          creator_id: context.user.id,
          estimation_type: estimationType,
          extended_estimation: content.settings?.extended_estimation ?? false,
          name: boardName.trim(),
          ws_id: context.wsId,
        })
        .select('id')
        .single();

      if (boardError || !createdBoard) {
        if (isUniqueViolation(boardError)) {
          return taskBoardNameExistsResponse();
        }

        console.error('Failed to create board:', boardError);
        return NextResponse.json(
          { error: 'Failed to create board' },
          { status: 500 }
        );
      }

      const newBoardId = createdBoard.id;

      const { error: deleteError } = await context.supabase
        .from('task_lists')
        .delete()
        .eq('board_id', newBoardId);

      if (deleteError) {
        console.warn(
          'Warning: Could not delete auto-created lists:',
          deleteError
        );
      }

      let labelsCreatedCount = 0;
      if (content.labels && content.labels.length > 0) {
        const { data: existingLabels } = await context.supabase
          .from('workspace_task_labels')
          .select('name')
          .eq('ws_id', context.wsId);

        const existingLabelNames = new Set(
          (existingLabels ?? []).map((label) => label.name.toLowerCase())
        );
        const labelsToCreate = content.labels
          .filter((label) => !existingLabelNames.has(label.name.toLowerCase()))
          .map((label) => ({
            color: label.color,
            creator_id: context.user.id,
            name: label.name,
            ws_id: context.wsId,
          }));

        if (labelsToCreate.length > 0) {
          const { data: createdLabels, error: labelsError } =
            await context.supabase
              .from('workspace_task_labels')
              .insert(labelsToCreate)
              .select('id');

          if (labelsError) {
            console.warn('Warning: Could not create labels:', labelsError);
          } else {
            labelsCreatedCount = createdLabels?.length ?? 0;
          }
        }
      }

      let totalListsCreated = 0;
      let totalTasksCreated = 0;

      if (content.lists.length > 0) {
        const listsToCreate = content.lists.map((list, index) => ({
          archived: list.archived || false,
          board_id: newBoardId,
          color: list.color,
          creator_id: context.user.id,
          deleted: false,
          name: list.name,
          position: list.position ?? index,
          status: isValidListStatus(list.status) ? list.status : 'active',
        }));

        const { data: createdLists, error: listsError } = await context.supabase
          .from('task_lists')
          .insert(listsToCreate)
          .select('id, position');

        if (listsError || !createdLists) {
          console.error('List creation error:', listsError);
        } else {
          totalListsCreated = createdLists.length;

          const listIdMap = new Map<number, string>();
          for (const list of createdLists) {
            if (list.position != null) listIdMap.set(list.position, list.id);
          }

          const allTasksToCreate: Array<{
            completed: boolean;
            creator_id: string;
            description: string | null;
            end_date: string | null;
            list_id: string;
            name: string;
            priority: TaskPriority;
            start_date: string | null;
          }> = [];

          for (let index = 0; index < content.lists.length; index++) {
            const originalList = content.lists[index];
            if (!originalList?.tasks?.length) continue;

            const newListId = listIdMap.get(index);
            if (!newListId) continue;

            allTasksToCreate.push(
              ...originalList.tasks.map((task) => ({
                completed: task.completed || false,
                creator_id: context.user.id,
                description: task.description || null,
                end_date: task.end_date || null,
                list_id: newListId,
                name: task.name,
                priority: task.priority || null,
                start_date: task.start_date || null,
              }))
            );
          }

          if (allTasksToCreate.length > 0) {
            const { data: createdTasks, error: tasksError } =
              await context.supabase
                .from('tasks')
                .insert(allTasksToCreate)
                .select('id');

            if (tasksError) {
              console.error('Task insertion error:', tasksError);
            } else {
              totalTasksCreated = createdTasks?.length ?? 0;
            }
          }
        }
      }

      return NextResponse.json({
        board: {
          id: newBoardId,
          name: boardName.trim(),
        },
        message: 'Board created from template successfully',
        stats: {
          labelsCreated: labelsCreatedCount,
          listsCreated: totalListsCreated,
          tasksCreated: totalTasksCreated,
        },
        success: true,
      });
    } catch (error) {
      return handleTemplateRouteError(error, 'Error using template:');
    }
  },
  { allowAppSessionAuth: BOARD_TEMPLATES_APP_SESSION_AUTH }
);
