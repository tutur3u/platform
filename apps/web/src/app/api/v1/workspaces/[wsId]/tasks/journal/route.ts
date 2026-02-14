import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import type { CreditCheckResult } from '@tuturuuu/ai/credits/types';
import { quickJournalTaskSchema } from '@tuturuuu/ai/object/types';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  isTaskPriority,
  TaskPriorities,
  type TaskPriority,
} from '@tuturuuu/types/primitives/Priority';
import { gateway, generateObject, NoObjectGeneratedError } from 'ai';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { NextResponse } from 'next/server';
import { z } from 'zod';

dayjs.extend(utc);
dayjs.extend(timezone);

const providedTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  priority: z.enum(['critical', 'high', 'normal', 'low']).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  estimationPoints: z.number().int().min(0).max(8).nullable().optional(),
  projectIds: z.array(z.string()).optional(),
  labels: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
      })
    )
    .optional(),
  labelSuggestions: z.array(z.string()).optional(),
});

const requestSchema = z.object({
  entry: z.string().min(1, 'Journal entry is required'),
  listId: z.string().optional(),
  previewOnly: z.boolean().optional(),
  tasks: z.array(providedTaskSchema).optional(),
  generatedWithAI: z.boolean().optional(),
  labelIds: z.array(z.string()).optional(),
  assigneeIds: z.array(z.string()).optional(),
  generateDescriptions: z.boolean().optional(),
  generatePriority: z.boolean().optional(),
  generateLabels: z.boolean().optional(),
  clientTimezone: z.string().optional(),
  clientTimestamp: z.string().optional(),
});

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_LABEL_SUGGESTIONS = 6;
const LABEL_COLOR_PALETTE = [
  'blue',
  'green',
  'purple',
  'orange',
  'pink',
  'yellow',
  'red',
  'gray',
];
const DEFAULT_LABEL_COLOR = 'blue';

const sanitizeWord = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 48);

const toTitleCase = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(' ');

const deriveLabelSuggestions = (
  title: string,
  description: string,
  seeds: string[] = []
) => {
  const suggestions = new Set<string>();

  seeds.forEach((seed) => {
    const normalized = sanitizeWord(seed);
    if (normalized) {
      suggestions.add(normalized);
    }
  });

  const text = `${title} ${description}`.toLowerCase();
  const tokens = text.match(/[a-z0-9]{3,}/g) ?? [];

  for (const token of tokens) {
    if (suggestions.size >= MAX_LABEL_SUGGESTIONS) break;
    const normalized = sanitizeWord(token);
    if (normalized) {
      suggestions.add(normalized);
    }
  }

  if (!suggestions.size) {
    const fallback = sanitizeWord(
      title.split(/[^a-z0-9]+/i).find(Boolean) ?? 'task'
    );
    if (fallback) {
      suggestions.add(fallback);
    }
  }

  return Array.from(suggestions)
    .slice(0, MAX_LABEL_SUGGESTIONS)
    .map(toTitleCase);
};

const normalizeLabelName = (value: string) => sanitizeWord(value);

const pickLabelColor = (existingCount: number) =>
  LABEL_COLOR_PALETTE[existingCount % LABEL_COLOR_PALETTE.length] ||
  DEFAULT_LABEL_COLOR;

const normalizeDueDate = (
  value: string | null | undefined,
  timezoneContext: string
) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed = dayjs.tz(trimmed, timezoneContext);

  if (!parsed.isValid()) {
    parsed = dayjs(trimmed);
    if (!parsed.isValid()) {
      return null;
    }
    parsed = parsed.tz(timezoneContext, true);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    parsed = parsed.endOf('day');
  }

  return parsed.toISOString();
};

type ProvidedLabel = {
  id?: string;
  name: string;
};

type CandidateTask = {
  title: string;
  description: string;
  priority: TaskPriority | null;
  labelSuggestions: string[];
  labels: ProvidedLabel[];
  dueDate: string | null;
  estimationPoints?: number | null;
  projectIds?: string[];
};

export const maxDuration = 45;

// Helper: authenticate and restrict to Tuturuuu email
async function getAuthorizedUser(supabase: TypedSupabaseClient) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      kind: 'error' as const,
      status: 401 as const,
      body: { error: 'Unauthorized' },
    };
  }

  // if (!isValidTuturuuuEmail(user.email)) {
  //   return {
  //     kind: 'error' as const,
  //     status: 403 as const,
  //     body: { error: 'This feature is limited to Tuturuuu team members.' },
  //   };
  // }

  return { kind: 'ok' as const, user };
}

// Helper: parse and validate request body
function parseRequestBody(rawBody: unknown) {
  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      kind: 'error' as const,
      status: 400 as const,
      body: { error: 'Invalid payload', details: parsed.error.flatten() },
    };
  }
  return { kind: 'ok' as const, data: parsed.data };
}

// Helper: ensure workspace membership
async function ensureWorkspaceAccess(
  supabase: TypedSupabaseClient,
  wsId: string,
  userId: string
) {
  const { data: memberCheck } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!memberCheck) {
    return {
      kind: 'error' as const,
      status: 403 as const,
      body: { error: 'Workspace access denied' },
    };
  }
  return { kind: 'ok' as const };
}

// Helper: verify list access (optional if preview-only)
async function getListIfProvided(
  supabase: TypedSupabaseClient,
  listId: string | undefined,
  wsId: string
) {
  if (!listId)
    return {
      kind: 'ok' as const,
      list: null as { id: string; name: string | null } | null,
    };

  const { data: listData, error: listError } = await supabase
    .from('task_lists')
    .select('id, name, workspace_boards!inner(id, ws_id)')
    .eq('id', listId)
    .eq('workspace_boards.ws_id', wsId)
    .maybeSingle();

  if (listError) {
    console.error('Error checking task list:', listError);
    return {
      kind: 'error' as const,
      status: 500 as const,
      body: { error: 'Unable to verify task list' },
    };
  }

  if (!listData) {
    return {
      kind: 'error' as const,
      status: 404 as const,
      body: { error: 'List not found or access denied' },
    };
  }

  return {
    kind: 'ok' as const,
    list: { id: listData.id, name: listData.name },
  };
}

// Helper: compute time context strings
function computeTimeContext(clientTimezone?: string, clientTimestamp?: string) {
  const timezoneContext = (clientTimezone ?? '').trim() || 'UTC';
  let baseTime = clientTimestamp
    ? dayjs.tz(clientTimestamp, timezoneContext)
    : dayjs().tz(timezoneContext);
  if (!baseTime.isValid()) {
    baseTime = dayjs().tz(timezoneContext);
  }
  const clientIsoTimestamp = baseTime.toISOString();
  const localTimeDescription = baseTime.format('dddd, MMMM D YYYY h:mm A z');
  return { timezoneContext, clientIsoTimestamp, localTimeDescription };
}

// Helper: build system prompt
function buildSystemPrompt(
  generateDescriptions: boolean,
  generatePriority: boolean,
  generateLabels: boolean,
  localTimeDescription: string,
  timezoneContext: string,
  clientIsoTimestamp: string
) {
  const promptInstructions = [
    'You are an executive assistant turning raw journal notes into actionable tasks.',
    generateDescriptions
      ? 'Each task must include a concise, verb-led title and a short description with clear next steps.'
      : 'Only provide a concise, verb-led title. Leave the description field empty.',
    generatePriority
      ? `Assign one of the available priority values (${TaskPriorities.join(', ')}) when confident; otherwise omit the priority field.`
      : 'Do not assign a priority for any task.',
    generateLabels
      ? `Provide up to ${MAX_LABEL_SUGGESTIONS} labelSuggestions per task. Suggestions must be short keywords (1-2 words), lowercase, no duplicates, reflecting themes from the task.`
      : 'Return an empty array for labelSuggestions.',
    'If the journal note contains an explicit deadline, provide dueDate as an ISO date (YYYY-MM-DD). Otherwise omit the field.',
    `The user's local time when they submitted this entry is ${localTimeDescription} (timezone: ${timezoneContext}, ISO: ${clientIsoTimestamp}). Interpret temporal references relative to this time.`,
    'When the journal references times like “tonight”, “tomorrow morning”, or similar, convert them into an exact calendar date in the user’s timezone and populate dueDate with that ISO date.',
    'Do not invent requirements or reference this instruction. Focus on concrete outcomes the user should pursue.',
  ];
  return promptInstructions.join('\n');
}

// Helper: normalize provided tasks
function normalizeProvidedTasks(
  tasks: z.infer<typeof providedTaskSchema>[] | undefined
) {
  if (!tasks?.length) return null;
  return tasks
    .map((task) => ({
      title: task.title.trim(),
      description: (task.description ?? '').trim(),
      priority: task.priority ?? undefined,
      dueDate: task.dueDate ?? null,
      estimationPoints: task.estimationPoints ?? null,
      projectIds: task.projectIds ?? [],
      labels: Array.isArray(task.labels)
        ? task.labels
            .map((label) => ({
              id: label.id?.trim() || undefined,
              name: label.name.trim(),
            }))
            .filter((label) => label.name.length > 0)
        : [],
      labelSuggestions: (task.labelSuggestions ?? []).map((label) =>
        label.trim()
      ),
    }))
    .filter((task) => task.title.length > 0);
}

// Helper: generate AI tasks
async function generateAiTasks(
  systemPrompt: string,
  trimmedEntry: string,
  maxOutputTokens?: number | null
) {
  const prompt = `${systemPrompt}\n\nJournal note:\n"""\n${trimmedEntry}\n"""`;
  const { object, usage } = await generateObject({
    model: gateway('google/gemini-2.5-flash-lite'),
    schema: quickJournalTaskSchema,
    prompt,
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
  });
  const tasks = (object.tasks || [])
    .map((task) => ({
      title: task.title?.trim() ?? '',
      description: task.description?.trim() ?? '',
      priority: task.priority,
      dueDate: task.dueDate ?? null,
      labels: [],
      labelSuggestions: Array.isArray(task.labelSuggestions)
        ? task.labelSuggestions.map((label) => label.trim())
        : [],
    }))
    .filter((task) => task.title.length > 0);

  return { tasks, usage };
}

// Helper: build candidate tasks from source
function buildCandidateTasks(
  sourceTasks: Array<any>,
  options: {
    generateDescriptions: boolean;
    generatePriority: boolean;
    generateLabels: boolean;
    timezoneContext: string;
  }
) {
  const candidateTasks: CandidateTask[] = [];
  for (const task of sourceTasks) {
    const trimmedTitle = task.title?.trim().slice(0, MAX_TITLE_LENGTH) ?? '';
    if (!trimmedTitle) continue;

    const formattedTitle =
      trimmedTitle[0]?.toUpperCase() + trimmedTitle.slice(1);
    const rawDescription = (task.description ?? '')
      .trim()
      .slice(0, MAX_DESCRIPTION_LENGTH);
    const descriptionValue = options.generateDescriptions ? rawDescription : '';
    const priorityValue =
      options.generatePriority && task.priority && isTaskPriority(task.priority)
        ? task.priority
        : null;
    const seedSuggestions =
      options.generateLabels && Array.isArray(task.labelSuggestions)
        ? task.labelSuggestions.filter(Boolean)
        : [];
    const labelSuggestions = options.generateLabels
      ? deriveLabelSuggestions(formattedTitle, rawDescription, seedSuggestions)
      : [];
    const labelsPayload: ProvidedLabel[] = Array.isArray((task as any).labels)
      ? (task as any).labels
      : [];
    const dueDateValue = normalizeDueDate(
      (task as any).dueDate ?? null,
      options.timezoneContext
    );
    const estimationPoints = (task as any).estimationPoints ?? null;
    const projectIds = (task as any).projectIds ?? [];

    candidateTasks.push({
      title: formattedTitle,
      description: descriptionValue,
      priority: priorityValue,
      labelSuggestions,
      labels: labelsPayload,
      dueDate: dueDateValue,
      estimationPoints,
      projectIds,
    });
  }
  return candidateTasks;
}

// Helper: preview response payload
function buildPreviewPayload(candidateTasks: CandidateTask[]) {
  return candidateTasks.map((task, index) => ({
    id: `preview-${index}`,
    name: task.title,
    description: task.description || null,
    priority: task.priority ?? null,
    labelSuggestions: task.labelSuggestions,
    dueDate: task.dueDate,
    labels: task.labels,
    estimationPoints: task.estimationPoints ?? null,
    projectIds: task.projectIds ?? [],
  }));
}

// Helper: load existing labels map
async function loadLabelNameMap(supabase: TypedSupabaseClient, wsId: string) {
  const labelNameMap = new Map<
    string,
    { id: string; name: string; color: string }
  >();
  const { data: existingLabels, error: labelsError } = await supabase
    .from('workspace_task_labels')
    .select('id, name, color')
    .eq('ws_id', wsId);

  if (labelsError) {
    console.error('Error fetching workspace labels:', labelsError);
    return {
      kind: 'error' as const,
      status: 500 as const,
      body: { error: 'Failed to load workspace labels' },
    };
  }

  (existingLabels ?? []).forEach((label) => {
    const normalized = normalizeLabelName(label.name);
    if (normalized) {
      labelNameMap.set(normalized, label);
    }
  });

  return { kind: 'ok' as const, labelNameMap };
}

// Helper: load valid project IDs for workspace
async function loadWorkspaceProjectIds(
  supabase: TypedSupabaseClient,
  wsId: string
) {
  const { data: projects, error: projectsError } = await supabase
    .from('task_projects')
    .select('id')
    .eq('ws_id', wsId);

  if (projectsError) {
    console.error('Error fetching workspace projects:', projectsError);
    return {
      kind: 'error' as const,
      status: 500 as const,
      body: { error: 'Failed to load workspace projects' },
    };
  }

  const validProjectIds = new Set(
    (projects ?? []).map((project) => project.id)
  );
  return { kind: 'ok' as const, validProjectIds };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    const authResult = await getAuthorizedUser(supabase);
    if (authResult.kind === 'error') {
      return NextResponse.json(authResult.body, { status: authResult.status });
    }
    const user = authResult.user;

    const rawBody = await req.json();
    const bodyResult = parseRequestBody(rawBody);
    if (bodyResult.kind === 'error') {
      return NextResponse.json(bodyResult.body, { status: bodyResult.status });
    }
    const parsedBody = { success: true, data: bodyResult.data } as const;

    const {
      entry,
      listId,
      previewOnly,
      tasks,
      generatedWithAI,
      labelIds,
      assigneeIds,
      generateDescriptions = true,
      generatePriority = true,
      generateLabels = true,
      clientTimezone,
      clientTimestamp,
    } = parsedBody.data;

    const trimmedEntry = entry.trim();
    if (!trimmedEntry) {
      return NextResponse.json(
        { error: 'Journal entry is empty' },
        { status: 400 }
      );
    }

    if (!previewOnly && !listId) {
      return NextResponse.json(
        { error: 'Task list is required to create tasks' },
        { status: 400 }
      );
    }

    const wsAccess = await ensureWorkspaceAccess(supabase, wsId, user.id);
    if (wsAccess.kind === 'error') {
      return NextResponse.json(wsAccess.body, { status: wsAccess.status });
    }

    // Pre-flight AI credit check
    let creditCheck: CreditCheckResult | null = null;
    const shouldInvokeAIEarly = !tasks?.length || previewOnly;
    if (shouldInvokeAIEarly) {
      const result = await checkAiCredits(
        wsId,
        'gemini-2.5-flash-lite',
        'task_journal',
        { userId: user.id }
      );
      creditCheck = result;
      if (!result.allowed) {
        return NextResponse.json(
          {
            error: result.errorMessage || 'AI credits insufficient',
            code: result.errorCode,
          },
          { status: 403 }
        );
      }
    }

    let listCheck: { id: string; name: string | null } | null = null;
    if (listId) {
      const listResult = await getListIfProvided(supabase, listId, wsId);
      if (listResult.kind === 'error') {
        return NextResponse.json(listResult.body, {
          status: listResult.status,
        });
      }
      listCheck = listResult.list;
    }

    const { timezoneContext, clientIsoTimestamp, localTimeDescription } =
      computeTimeContext(clientTimezone, clientTimestamp);
    const systemPrompt = buildSystemPrompt(
      generateDescriptions,
      generatePriority,
      generateLabels,
      localTimeDescription,
      timezoneContext,
      clientIsoTimestamp
    );

    const providedTasks = normalizeProvidedTasks(tasks);

    let aiTasks:
      | {
          title: string;
          description: string;
          priority?: TaskPriority;
          labelSuggestions: string[];
        }[]
      | null = null;

    const shouldInvokeAI = !providedTasks || previewOnly;

    if (shouldInvokeAI) {
      try {
        const result = await generateAiTasks(
          systemPrompt,
          trimmedEntry,
          creditCheck?.maxOutputTokens
        );
        aiTasks = result.tasks;

        // Deduct credits after successful AI generation
        if (result.usage) {
          deductAiCredits({
            wsId,
            userId: user.id,
            modelId: 'gemini-2.5-flash-lite',
            inputTokens: result.usage.inputTokens ?? 0,
            outputTokens: result.usage.outputTokens ?? 0,
            reasoningTokens:
              result.usage.outputTokenDetails?.reasoningTokens ??
              result.usage.reasoningTokens ??
              0,
            feature: 'task_journal',
          }).catch((err: unknown) =>
            console.error('Failed to deduct AI credits:', err)
          );
        }
      } catch (generationError) {
        console.error('Quick journal AI generation failed:', generationError);

        // Even on failure, deduct credits for tokens consumed by the model
        if (NoObjectGeneratedError.isInstance(generationError)) {
          const failedUsage = generationError.usage;
          if (failedUsage) {
            deductAiCredits({
              wsId,
              userId: user.id,
              modelId: 'gemini-2.5-flash-lite',
              inputTokens: failedUsage.inputTokens ?? 0,
              outputTokens: failedUsage.outputTokens ?? 0,
              reasoningTokens: failedUsage.reasoningTokens ?? 0,
              feature: 'task_journal',
            }).catch((err: unknown) =>
              console.error('Failed to deduct AI credits on error:', err)
            );
          }
        }

        return NextResponse.json(
          { error: 'AI could not generate tasks from this journal entry.' },
          { status: 502 }
        );
      }

      if (!aiTasks?.length) {
        return NextResponse.json(
          { error: 'We could not generate tasks from this journal entry.' },
          { status: 422 }
        );
      }
    }

    const sourceTasks = providedTasks ?? aiTasks ?? [];
    const candidateTasks = buildCandidateTasks(sourceTasks, {
      generateDescriptions,
      generatePriority,
      generateLabels,
      timezoneContext,
    });

    if (!candidateTasks.length) {
      return NextResponse.json(
        { error: 'No valid tasks were generated from this journal entry.' },
        { status: 422 }
      );
    }

    if (previewOnly || !listCheck) {
      const previewPayload = buildPreviewPayload(candidateTasks);
      return NextResponse.json(
        {
          tasks: previewPayload,
          metadata: {
            generatedWithAI: Boolean(
              shouldInvokeAI ? aiTasks?.length : generatedWithAI
            ),
            totalTasks: previewPayload.length,
          },
        },
        { status: 200 }
      );
    }

    const labelMapResult = await loadLabelNameMap(supabase, wsId);
    if (labelMapResult.kind === 'error') {
      return NextResponse.json(labelMapResult.body, {
        status: labelMapResult.status,
      });
    }
    const labelNameMap = labelMapResult.labelNameMap;

    // Load valid project IDs for the workspace and validate before insertion
    const projectIdsResult = await loadWorkspaceProjectIds(supabase, wsId);
    if (projectIdsResult.kind === 'error') {
      return NextResponse.json(projectIdsResult.body, {
        status: projectIdsResult.status,
      });
    }
    const validProjectIds = projectIdsResult.validProjectIds;

    // Collect all incoming project IDs and validate them
    const incomingProjectIds = new Set<string>();
    for (const taskDefinition of candidateTasks) {
      if (taskDefinition.projectIds && taskDefinition.projectIds.length > 0) {
        taskDefinition.projectIds.forEach((projectId) => {
          incomingProjectIds.add(projectId);
        });
      }
    }

    // Check for invalid project IDs before any DB insertion
    const invalidProjectIds = Array.from(incomingProjectIds).filter(
      (projectId) => !validProjectIds.has(projectId)
    );

    if (invalidProjectIds.length > 0) {
      return NextResponse.json(
        {
          error: 'Invalid project IDs provided',
          details: {
            invalidProjectIds,
            message: 'One or more project IDs do not belong to this workspace',
          },
        },
        { status: 400 }
      );
    }

    const ensureLabelId = async (label: ProvidedLabel) => {
      if (label.id) {
        return label.id;
      }

      const normalized = normalizeLabelName(label.name);
      if (!normalized) {
        return null;
      }

      const existing = labelNameMap.get(normalized);
      if (existing) {
        return existing.id;
      }

      const labelName = toTitleCase(label.name.trim());
      const color = pickLabelColor(labelNameMap.size);

      const { data: createdLabel, error: createLabelError } = await supabase
        .from('workspace_task_labels')
        .insert({
          name: labelName,
          color,
          ws_id: wsId,
          creator_id: user.id,
        })
        .select('id, name, color')
        .single();

      if (createLabelError || !createdLabel) {
        console.error(
          'Error creating label from journal suggestions:',
          createLabelError
        );
        return null;
      }

      const createdNormalized = normalizeLabelName(createdLabel.name);
      if (createdNormalized) {
        labelNameMap.set(createdNormalized, createdLabel);
      }

      return createdLabel.id;
    };

    const nowIso = new Date().toISOString();
    const tasksToInsert = candidateTasks.map((task) => ({
      name: task.title,
      description: task.description || null,
      list_id: listCheck.id,
      priority: task.priority,
      end_date: task.dueDate,
      estimation_points: task.estimationPoints ?? null,
      created_at: nowIso,
    }));

    const { data: insertedTasks, error: insertError } = await supabase
      .from('tasks')
      .insert(tasksToInsert)
      .select(
        `
        id,
        name,
        description,
        priority,
        completed,
        start_date,
        end_date,
        created_at,
        list_id,
        task_lists (
          id,
          name,
          board_id,
          workspace_boards (
            id,
            name,
            ws_id
          )
        )
      `
      );

    if (insertError || !insertedTasks) {
      console.error('Error inserting tasks from journal:', insertError);
      return NextResponse.json(
        { error: 'Failed to save task' },
        { status: 500 }
      );
    }

    const globalLabelIdSet = new Set((labelIds ?? []).filter(Boolean));
    const labelAssignments: { task_id: string; label_id: string }[] = [];

    for (let index = 0; index < insertedTasks.length; index += 1) {
      const insertedTask = insertedTasks[index];
      const taskDefinition = candidateTasks[index];

      if (!insertedTask || !taskDefinition) {
        continue;
      }

      const labelIdsForTask = new Set<string>(globalLabelIdSet);

      if (taskDefinition.labels?.length) {
        for (const label of taskDefinition.labels) {
          const resolvedId = await ensureLabelId(label);
          if (resolvedId) {
            labelIdsForTask.add(resolvedId);
          }
        }
      } else if (generateLabels && taskDefinition.labelSuggestions.length) {
        for (const suggestion of taskDefinition.labelSuggestions) {
          const normalized = normalizeLabelName(suggestion);
          const existing = normalized
            ? labelNameMap.get(normalized)
            : undefined;
          if (existing) {
            labelIdsForTask.add(existing.id);
          }
        }
      }

      labelIdsForTask.forEach((resolvedLabelId) => {
        labelAssignments.push({
          task_id: insertedTask.id,
          label_id: resolvedLabelId,
        });
      });
    }

    if (labelAssignments.length) {
      const { error: labelInsertError } = await supabase
        .from('task_labels')
        .insert(labelAssignments);

      if (labelInsertError) {
        console.error('Error assigning labels to tasks:', labelInsertError);
      }
    }

    // Assign projects to tasks (validation already performed earlier)
    const projectAssignments: { task_id: string; project_id: string }[] = [];

    for (let index = 0; index < insertedTasks.length; index += 1) {
      const insertedTask = insertedTasks[index];
      const taskDefinition = candidateTasks[index];

      if (!insertedTask || !taskDefinition) {
        continue;
      }

      if (taskDefinition.projectIds && taskDefinition.projectIds.length > 0) {
        taskDefinition.projectIds.forEach((projectId) => {
          // Project ID validity already checked before insertion
          if (validProjectIds.has(projectId)) {
            projectAssignments.push({
              task_id: insertedTask.id,
              project_id: projectId,
            });
          }
        });
      }
    }

    if (projectAssignments.length) {
      const { error: projectInsertError } = await supabase
        .from('task_project_tasks')
        .insert(projectAssignments);

      if (projectInsertError) {
        console.error('Error assigning projects to tasks:', projectInsertError);
      }
    }

    // Assign users to tasks (e.g. auto-assign to creator)
    const validAssigneeIds = (assigneeIds ?? []).filter(Boolean);
    if (validAssigneeIds.length > 0 && insertedTasks.length > 0) {
      const assigneeAssignments = insertedTasks.flatMap((task) =>
        validAssigneeIds.map((uid) => ({
          task_id: task.id,
          user_id: uid,
        }))
      );

      const { error: assigneeInsertError } = await supabase
        .from('task_assignees')
        .insert(assigneeAssignments);

      if (assigneeInsertError) {
        console.error('Error assigning users to tasks:', assigneeInsertError);
      }
    }

    return NextResponse.json(
      {
        tasks: insertedTasks,
        metadata: {
          generatedWithAI: Boolean(
            shouldInvokeAI ? aiTasks?.length : generatedWithAI
          ),
          totalTasks: insertedTasks.length,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in journal task endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to process journal entry' },
      { status: 500 }
    );
  }
}
