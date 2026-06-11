import { google } from '@ai-sdk/google';
import { capMaxOutputTokensByCredits } from '@tuturuuu/ai/credits/cap-output-tokens';
import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import {
  PlanModelResolutionError,
  resolvePlanModel,
} from '@tuturuuu/ai/credits/resolve-plan-model';
import type { CreditCheckResult } from '@tuturuuu/ai/credits/types';
import { withAiMemory } from '@tuturuuu/ai/memory';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  isTaskPriority,
  type TaskPriority,
} from '@tuturuuu/types/primitives/Priority';
import type { CalendarHoursType } from '@tuturuuu/types/primitives/Task';
import {
  MAX_COLOR_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
  MAX_TASK_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { generateObject, NoObjectGeneratedError } from 'ai';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';

dayjs.extend(utc);
dayjs.extend(timezone);

const TASK_SUGGESTION_LIMIT = 12;
const MAX_DURATION_MINUTES = 24 * 60;
const MIN_DURATION_MINUTES = 15;
const DURATION_STEP_MINUTES = 15;
const TASK_SUGGESTIONS_CREDIT_FEATURE = 'task_journal';
const CALENDAR_HOURS = [
  'work_hours',
  'meeting_hours',
  'personal_hours',
] as const satisfies readonly CalendarHoursType[];

const requestSchema = z.object({
  boardId: z.guid(),
  prompt: z.string().trim().min(1).max(MAX_LONG_TEXT_LENGTH),
  description: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
  currentListId: z.guid().optional(),
  clientTimezone: z.string().max(MAX_SHORT_TEXT_LENGTH).optional(),
  clientTimestamp: z.string().max(MAX_COLOR_LENGTH).optional(),
});

const modelSuggestionSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(MAX_TASK_NAME_LENGTH),
        description: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
        priority: z
          .enum(['critical', 'high', 'normal', 'low'])
          .nullable()
          .optional(),
        listId: z.string().max(MAX_NAME_LENGTH).optional(),
        labelIds: z.array(z.string().max(MAX_NAME_LENGTH)).optional(),
        projectIds: z.array(z.string().max(MAX_NAME_LENGTH)).optional(),
        endDate: z.string().max(MAX_COLOR_LENGTH).nullable().optional(),
        estimationPoints: z.number().int().min(0).max(99).nullable().optional(),
        durationMinutes: z
          .number()
          .int()
          .min(0)
          .max(MAX_DURATION_MINUTES)
          .nullable()
          .optional(),
        isSplittable: z.boolean().optional(),
        minSplitDurationMinutes: z
          .number()
          .int()
          .min(0)
          .max(MAX_DURATION_MINUTES)
          .nullable()
          .optional(),
        maxSplitDurationMinutes: z
          .number()
          .int()
          .min(0)
          .max(MAX_DURATION_MINUTES)
          .nullable()
          .optional(),
        calendarHours: z.enum(CALENDAR_HOURS).nullable().optional(),
        autoSchedule: z.boolean().optional(),
        reason: z.string().max(240).nullable().optional(),
      })
    )
    .min(1)
    .max(TASK_SUGGESTION_LIMIT),
});

type BoardContext = {
  id: string;
  name: string | null;
  estimation_type: string | null;
  extended_estimation: boolean | null;
  allow_zero_estimates: boolean | null;
};

type ListContext = {
  id: string;
  name: string | null;
};

type LabelContext = {
  id: string;
  name: string;
  color: string | null;
  created_at: string | null;
};

type ProjectContext = {
  id: string;
  name: string;
  status: string | null;
};

type SanitizedSuggestion = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority | null;
  listId: string;
  listName: string | null;
  labelIds: string[];
  labels: LabelContext[];
  projectIds: string[];
  projects: ProjectContext[];
  endDate: string | null;
  estimationPoints: number | null;
  durationMinutes: number | null;
  isSplittable: boolean;
  minSplitDurationMinutes: number | null;
  maxSplitDurationMinutes: number | null;
  calendarHours: CalendarHoursType | null;
  autoSchedule: boolean;
  reason: string | null;
};

function parseRequestBody(rawBody: unknown) {
  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      kind: 'error' as const,
      response: NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      ),
    };
  }

  return { kind: 'ok' as const, data: parsed.data };
}

async function ensureWorkspaceAccess(
  supabase: TypedSupabaseClient,
  wsId: string,
  userId: string
) {
  const memberCheck = await verifyWorkspaceMembershipType({
    wsId,
    userId,
    supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return {
      kind: 'error' as const,
      response: NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      ),
    };
  }

  if (!memberCheck.ok) {
    return {
      kind: 'error' as const,
      response: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  return { kind: 'ok' as const };
}

async function loadBoardContext(
  supabase: TypedSupabaseClient,
  wsId: string,
  boardId: string
) {
  const { data, error } = await supabase
    .from('workspace_boards')
    .select(
      'id, name, estimation_type, extended_estimation, allow_zero_estimates'
    )
    .eq('id', boardId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) {
    serverLogger.error('Failed to load board for task suggestions', {
      boardId,
      error,
      wsId,
    });
    return {
      kind: 'error' as const,
      response: NextResponse.json(
        { error: 'Failed to load board context' },
        { status: 500 }
      ),
    };
  }

  if (!data) {
    return {
      kind: 'error' as const,
      response: NextResponse.json(
        { error: 'Board not found or access denied' },
        { status: 404 }
      ),
    };
  }

  return { kind: 'ok' as const, board: data as BoardContext };
}

async function loadSuggestionContext(
  supabase: TypedSupabaseClient,
  wsId: string,
  boardId: string
) {
  const [listsResult, labelsResult, projectsResult] = await Promise.all([
    supabase
      .from('task_lists')
      .select('id, name')
      .eq('board_id', boardId)
      .eq('deleted', false)
      .order('position')
      .order('created_at'),
    supabase
      .from('workspace_task_labels')
      .select('id, name, color, created_at')
      .eq('ws_id', wsId)
      .order('name'),
    supabase
      .from('task_projects')
      .select('id, name, status')
      .eq('ws_id', wsId)
      .order('name'),
  ]);

  if (listsResult.error) {
    serverLogger.error('Failed to load lists for task suggestions', {
      boardId,
      error: listsResult.error,
      wsId,
    });
    return {
      kind: 'error' as const,
      response: NextResponse.json(
        { error: 'Failed to load board lists' },
        { status: 500 }
      ),
    };
  }

  if (labelsResult.error) {
    serverLogger.error('Failed to load labels for task suggestions', {
      error: labelsResult.error,
      wsId,
    });
    return {
      kind: 'error' as const,
      response: NextResponse.json(
        { error: 'Failed to load workspace labels' },
        { status: 500 }
      ),
    };
  }

  if (projectsResult.error) {
    serverLogger.error('Failed to load projects for task suggestions', {
      error: projectsResult.error,
      wsId,
    });
    return {
      kind: 'error' as const,
      response: NextResponse.json(
        { error: 'Failed to load workspace projects' },
        { status: 500 }
      ),
    };
  }

  const lists = (listsResult.data ?? []) as ListContext[];
  const labels = (labelsResult.data ?? []) as LabelContext[];
  const projects = (projectsResult.data ?? [])
    .filter((project) => project.status !== 'deleted')
    .map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
    })) as ProjectContext[];

  if (!lists.length) {
    return {
      kind: 'error' as const,
      response: NextResponse.json(
        { error: 'Create a list before asking AI for task suggestions' },
        { status: 422 }
      ),
    };
  }

  return { kind: 'ok' as const, lists, labels, projects };
}

function computeTimeContext(clientTimezone?: string, clientTimestamp?: string) {
  const timezoneContext = (clientTimezone ?? '').trim() || 'UTC';
  let baseTime = clientTimestamp
    ? dayjs.tz(clientTimestamp, timezoneContext)
    : dayjs().tz(timezoneContext);

  if (!baseTime.isValid()) {
    baseTime = dayjs().tz(timezoneContext);
  }

  return {
    clientIsoTimestamp: baseTime.toISOString(),
    localTimeDescription: baseTime.format('dddd, MMMM D YYYY h:mm A z'),
    timezoneContext,
  };
}

function normalizeEndDate(
  value: string | null | undefined,
  timezoneContext: string
) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed = dayjs.tz(trimmed, timezoneContext);
  if (!parsed.isValid()) {
    parsed = dayjs(trimmed);
    if (!parsed.isValid()) return null;
    parsed = parsed.tz(timezoneContext, true);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    parsed = parsed.endOf('day');
  }

  return parsed.toISOString();
}

function normalizeDuration(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const rounded =
    Math.round(value / DURATION_STEP_MINUTES) * DURATION_STEP_MINUTES;
  return Math.min(
    MAX_DURATION_MINUTES,
    Math.max(MIN_DURATION_MINUTES, rounded)
  );
}

function normalizeSplitDuration(
  value: number | null | undefined,
  durationMinutes: number | null
) {
  if (
    !durationMinutes ||
    value == null ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  const rounded =
    Math.round(value / DURATION_STEP_MINUTES) * DURATION_STEP_MINUTES;
  return Math.min(durationMinutes, Math.max(MIN_DURATION_MINUTES, rounded));
}

function sanitizeSuggestions({
  board,
  currentListId,
  labels,
  lists,
  projects,
  suggestions,
  timezoneContext,
}: {
  board: BoardContext;
  currentListId?: string;
  labels: LabelContext[];
  lists: ListContext[];
  projects: ProjectContext[];
  suggestions: z.infer<typeof modelSuggestionSchema>['tasks'];
  timezoneContext: string;
}) {
  const listsById = new Map(lists.map((list) => [list.id, list]));
  const labelsById = new Map(labels.map((label) => [label.id, label]));
  const projectsById = new Map(
    projects.map((project) => [project.id, project])
  );
  const fallbackList =
    (currentListId ? listsById.get(currentListId) : null) ?? lists[0];
  const hasEstimationConfig = Boolean(board.estimation_type);

  if (!fallbackList) return [];

  return suggestions
    .slice(0, TASK_SUGGESTION_LIMIT)
    .map((suggestion, index): SanitizedSuggestion | null => {
      const title = suggestion.title.trim().slice(0, MAX_TASK_NAME_LENGTH);
      if (!title) return null;

      const list = suggestion.listId
        ? (listsById.get(suggestion.listId) ?? fallbackList)
        : fallbackList;
      const labelIds = Array.from(new Set(suggestion.labelIds ?? [])).filter(
        (labelId) => labelsById.has(labelId)
      );
      const projectIds = Array.from(
        new Set(suggestion.projectIds ?? [])
      ).filter((projectId) => projectsById.has(projectId));
      const durationMinutes = normalizeDuration(suggestion.durationMinutes);
      const minSplitDurationMinutes = normalizeSplitDuration(
        suggestion.minSplitDurationMinutes,
        durationMinutes
      );
      const maxSplitDurationMinutes = normalizeSplitDuration(
        suggestion.maxSplitDurationMinutes,
        durationMinutes
      );
      const normalizedMaxSplitDurationMinutes =
        minSplitDurationMinutes && maxSplitDurationMinutes
          ? Math.max(minSplitDurationMinutes, maxSplitDurationMinutes)
          : maxSplitDurationMinutes;
      const isSplittable = Boolean(
        durationMinutes &&
          suggestion.isSplittable &&
          (minSplitDurationMinutes || normalizedMaxSplitDurationMinutes)
      );
      const priority = isTaskPriority(suggestion.priority)
        ? suggestion.priority
        : null;
      const rawEstimate =
        hasEstimationConfig && suggestion.estimationPoints != null
          ? Math.max(0, Math.min(99, suggestion.estimationPoints))
          : null;
      const estimationPoints =
        rawEstimate === 0 && !board.allow_zero_estimates ? null : rawEstimate;

      return {
        id: `suggestion-${index}`,
        title,
        description: suggestion.description?.trim() || null,
        priority,
        listId: list.id,
        listName: list.name,
        labelIds,
        labels: labelIds.flatMap((labelId) => {
          const label = labelsById.get(labelId);
          return label ? [label] : [];
        }),
        projectIds,
        projects: projectIds.flatMap((projectId) => {
          const project = projectsById.get(projectId);
          return project ? [project] : [];
        }),
        endDate: normalizeEndDate(suggestion.endDate, timezoneContext),
        estimationPoints,
        durationMinutes,
        isSplittable,
        minSplitDurationMinutes: isSplittable ? minSplitDurationMinutes : null,
        maxSplitDurationMinutes: isSplittable
          ? normalizedMaxSplitDurationMinutes
          : null,
        calendarHours: durationMinutes
          ? (suggestion.calendarHours ?? null)
          : null,
        autoSchedule: Boolean(durationMinutes && suggestion.autoSchedule),
        reason: suggestion.reason?.trim().slice(0, 240) || null,
      };
    })
    .filter((suggestion): suggestion is SanitizedSuggestion => !!suggestion);
}

function buildPrompt({
  board,
  clientIsoTimestamp,
  currentDescription,
  currentListId,
  labels,
  lists,
  localTimeDescription,
  projects,
  prompt,
  timezoneContext,
}: {
  board: BoardContext;
  clientIsoTimestamp: string;
  currentDescription?: string | null;
  currentListId?: string;
  labels: LabelContext[];
  lists: ListContext[];
  localTimeDescription: string;
  projects: ProjectContext[];
  prompt: string;
  timezoneContext: string;
}) {
  const context = {
    board: {
      id: board.id,
      name: board.name,
      hasEstimationConfig: Boolean(board.estimation_type),
      estimationType: board.estimation_type,
      extendedEstimation: Boolean(board.extended_estimation),
      allowZeroEstimates: Boolean(board.allow_zero_estimates),
    },
    currentListId: currentListId ?? null,
    validLists: lists.map((list) => ({ id: list.id, name: list.name })),
    validLabels: labels
      .slice(0, 200)
      .map((label) => ({ id: label.id, name: label.name })),
    validProjects: projects
      .slice(0, 200)
      .map((project) => ({ id: project.id, name: project.name })),
    localTime: {
      description: localTimeDescription,
      iso: clientIsoTimestamp,
      timezone: timezoneContext,
    },
  };

  return [
    'You are an expert task planning assistant for a task board.',
    'Analyze the task prompt and return one suggestion if it is a single actionable task, or multiple suggestions if the prompt clearly contains multiple independent tasks or should be broken down.',
    `Return between 1 and ${TASK_SUGGESTION_LIMIT} suggestions.`,
    'Use only IDs present in validLists, validLabels, and validProjects. Do not invent new IDs.',
    'If unsure about a list, choose the current list when provided, otherwise choose the best valid list.',
    'Choose labels and projects only when there is a strong contextual match.',
    'Use priority only when the prompt implies urgency, risk, customer impact, deadline pressure, or low importance.',
    'Use endDate only for explicit or strongly implied dates, interpreted in the user timezone.',
    'Use durationMinutes for practical scheduled work duration; omit it if unknown. Use 15-minute increments.',
    'Use estimationPoints only when the board has estimation configured.',
    'Keep reasons short and useful for review.',
    '',
    `Context JSON:\n${JSON.stringify(context)}`,
    '',
    `Task prompt:\n"""${prompt.trim()}"""`,
    currentDescription?.trim()
      ? `\nCurrent description:\n"""${currentDescription.trim()}"""`
      : '',
  ].join('\n');
}

async function resolveModelOrResponse(wsId: string) {
  try {
    const resolvedModel = await resolvePlanModel({
      capability: 'language',
      wsId,
    });
    return { kind: 'ok' as const, modelId: resolvedModel.modelId };
  } catch (error) {
    if (error instanceof PlanModelResolutionError) {
      const status = error.code === 'NO_ALLOCATION' ? 503 : 500;
      return {
        kind: 'error' as const,
        response: NextResponse.json(
          { error: error.message, code: error.code },
          { status }
        ),
      };
    }

    serverLogger.error('Failed to resolve task suggestions model', {
      error,
      wsId,
    });
    return {
      kind: 'error' as const,
      response: NextResponse.json(
        { error: 'Failed to resolve AI model for task suggestions.' },
        { status: 500 }
      ),
    };
  }
}

async function checkCreditsOrResponse(
  wsId: string,
  userId: string,
  modelId: string
) {
  const result = await checkAiCredits(
    wsId,
    modelId,
    TASK_SUGGESTIONS_CREDIT_FEATURE,
    {
      userId,
    }
  );

  if (!result.allowed) {
    return {
      kind: 'error' as const,
      response: NextResponse.json(
        {
          error: result.errorMessage || 'AI credits insufficient',
          code: result.errorCode,
        },
        { status: 403 }
      ),
    };
  }

  return { kind: 'ok' as const, creditCheck: result };
}

function deductSuggestionCredits({
  modelId,
  usage,
  userId,
  wsId,
}: {
  modelId: string;
  usage:
    | {
        inputTokens?: number;
        outputTokens?: number;
        outputTokenDetails?: { reasoningTokens?: number };
        reasoningTokens?: number;
      }
    | null
    | undefined;
  userId: string;
  wsId: string;
}) {
  if (!usage) return;

  deductAiCredits({
    wsId,
    userId,
    modelId,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens:
      usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens ?? 0,
    feature: TASK_SUGGESTIONS_CREDIT_FEATURE,
  }).catch((error: unknown) =>
    serverLogger.error('Failed to deduct task suggestion AI credits', {
      error,
      modelId,
      userId,
      wsId,
    })
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId: rawWsId } = await params;
    const supabase = await createClient(req);
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const bodyResult = parseRequestBody(rawBody);
    if (bodyResult.kind === 'error') {
      return bodyResult.response;
    }

    const wsId = await normalizeWorkspaceId(rawWsId, supabase);
    const workspaceAccess = await ensureWorkspaceAccess(
      supabase,
      wsId,
      user.id
    );
    if (workspaceAccess.kind === 'error') {
      return workspaceAccess.response;
    }

    const sbAdmin = await createAdminClient();
    const { boardId, clientTimestamp, clientTimezone, currentListId } =
      bodyResult.data;

    const boardResult = await loadBoardContext(sbAdmin, wsId, boardId);
    if (boardResult.kind === 'error') {
      return boardResult.response;
    }

    const contextResult = await loadSuggestionContext(sbAdmin, wsId, boardId);
    if (contextResult.kind === 'error') {
      return contextResult.response;
    }

    const modelResult = await resolveModelOrResponse(wsId);
    if (modelResult.kind === 'error') {
      return modelResult.response;
    }

    const creditResult = await checkCreditsOrResponse(
      wsId,
      user.id,
      modelResult.modelId
    );
    if (creditResult.kind === 'error') {
      return creditResult.response;
    }

    let cappedMaxOutput = creditResult.creditCheck.maxOutputTokens ?? null;
    cappedMaxOutput = await capMaxOutputTokensByCredits(
      sbAdmin,
      modelResult.modelId,
      cappedMaxOutput,
      (creditResult.creditCheck as CreditCheckResult).remainingCredits
    );
    if (
      cappedMaxOutput === null &&
      creditResult.creditCheck.remainingCredits <= 0
    ) {
      return NextResponse.json(
        { error: 'AI credits insufficient', code: 'CREDITS_EXHAUSTED' },
        { status: 403 }
      );
    }

    const { clientIsoTimestamp, localTimeDescription, timezoneContext } =
      computeTimeContext(clientTimezone, clientTimestamp);
    const prompt = buildPrompt({
      board: boardResult.board,
      clientIsoTimestamp,
      currentDescription: bodyResult.data.description,
      currentListId,
      labels: contextResult.labels,
      lists: contextResult.lists,
      localTimeDescription,
      projects: contextResult.projects,
      prompt: bodyResult.data.prompt,
      timezoneContext,
    });

    try {
      const { object, usage } = await generateObject({
        model: await withAiMemory({
          customId: `tasks-suggestions-${Date.now()}`,
          model: google(modelResult.modelId.split('/').slice(-1)[0]!),
          product: 'tasks',
          source: 'tasks_suggestions',
          surface: 'tasks_suggestions',
          userId: user.id,
          wsId,
        }),
        schema: modelSuggestionSchema,
        prompt,
        ...(cappedMaxOutput ? { maxOutputTokens: cappedMaxOutput } : {}),
      });

      deductSuggestionCredits({
        modelId: modelResult.modelId,
        usage,
        userId: user.id,
        wsId,
      });

      const tasks = sanitizeSuggestions({
        board: boardResult.board,
        currentListId,
        labels: contextResult.labels,
        lists: contextResult.lists,
        projects: contextResult.projects,
        suggestions: object.tasks,
        timezoneContext,
      });

      if (!tasks.length) {
        return NextResponse.json(
          { error: 'AI could not produce usable task suggestions.' },
          { status: 422 }
        );
      }

      return NextResponse.json(
        {
          tasks,
          metadata: {
            generatedWithAI: true,
            totalTasks: tasks.length,
          },
        },
        { status: 200 }
      );
    } catch (generationError) {
      serverLogger.error('Task suggestion AI generation failed', {
        error: generationError,
        wsId,
      });

      if (NoObjectGeneratedError.isInstance(generationError)) {
        deductSuggestionCredits({
          modelId: modelResult.modelId,
          usage: generationError.usage,
          userId: user.id,
          wsId,
        });
      }

      return NextResponse.json(
        { error: 'AI could not generate task suggestions.' },
        { status: 502 }
      );
    }
  } catch (error) {
    serverLogger.error('Unexpected task suggestions route failure', { error });
    return NextResponse.json(
      { error: 'Failed to generate task suggestions' },
      { status: 500 }
    );
  }
}
