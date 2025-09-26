import { google } from '@ai-sdk/google';
import { quickJournalTaskSchema } from '@tuturuuu/ai/object/types';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  isTaskPriority,
  TaskPriorities,
  type TaskPriority,
} from '@tuturuuu/types/primitives/Priority';
import { generateObject } from 'ai';
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
  generateDescriptions: z.boolean().optional(),
  generatePriority: z.boolean().optional(),
  generateLabels: z.boolean().optional(),
  clientTimezone: z.string().optional(),
  clientTimestamp: z.string().optional(),
});

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_AI_TASKS = 50;
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
};

export const maxDuration = 45;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = await req.json();
    const parsedBody = requestSchema.safeParse(rawBody);

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Invalid payload',
          details: parsedBody.error.flatten(),
        },
        { status: 400 }
      );
    }

    const {
      entry,
      listId,
      previewOnly,
      tasks,
      generatedWithAI,
      labelIds,
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

    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    let listCheck: { id: string; name: string | null } | null = null;
    if (listId) {
      const { data: listData, error: listError } = await supabase
        .from('task_lists')
        .select('id, name, workspace_boards!inner(id, ws_id)')
        .eq('id', listId)
        .eq('workspace_boards.ws_id', wsId)
        .maybeSingle();

      if (listError) {
        console.error('Error checking task list:', listError);
        return NextResponse.json(
          { error: 'Unable to verify task list' },
          { status: 500 }
        );
      }

      if (!listData) {
        return NextResponse.json(
          { error: 'List not found or access denied' },
          { status: 404 }
        );
      }

      listCheck = { id: listData.id, name: listData.name };
    }

    const timezoneContext = (clientTimezone ?? '').trim() || 'UTC';
    let baseTime = clientTimestamp
      ? dayjs.tz(clientTimestamp, timezoneContext)
      : dayjs().tz(timezoneContext);

    if (!baseTime.isValid()) {
      baseTime = dayjs().tz(timezoneContext);
    }

    const clientIsoTimestamp = baseTime.toISOString();
    const localTimeDescription = baseTime.format('dddd, MMMM D YYYY h:mm A z');

    const promptInstructions = [
      'You are an executive assistant turning raw journal notes into actionable tasks.',
      `Return between 1 and ${MAX_AI_TASKS} tasks that capture distinct follow-ups from the note.`,
      generateDescriptions
        ? 'Each task must include a concise, verb-led title and a short description with clear next steps.'
        : 'Only provide a concise, verb-led title. Leave the description field empty.',
      generatePriority
        ? `Assign one of the available priority values (${TaskPriorities.join(
            ', '
          )}) when confident; otherwise omit the priority field.`
        : 'Do not assign a priority for any task.',
      generateLabels
        ? `Provide up to ${MAX_LABEL_SUGGESTIONS} labelSuggestions per task. Suggestions must be short keywords (1-2 words), lowercase, no duplicates, reflecting themes from the task.`
        : 'Return an empty array for labelSuggestions.',
      'If the journal note contains an explicit deadline, provide dueDate as an ISO date (YYYY-MM-DD). Otherwise omit the field.',
      `The user's local time when they submitted this entry is ${localTimeDescription} (timezone: ${timezoneContext}, ISO: ${clientIsoTimestamp}). Interpret temporal references relative to this time.`,
      'When the journal references times like “tonight”, “tomorrow morning”, or similar, convert them into an exact calendar date in the user’s timezone and populate dueDate with that ISO date.',
      'Do not invent requirements or reference this instruction. Focus on concrete outcomes the user should pursue.',
    ];

    const systemPrompt = promptInstructions.join('\n');

    const providedTasks = tasks?.length
      ? tasks
          .map((task) => ({
            title: task.title.trim(),
            description: (task.description ?? '').trim(),
            priority: task.priority ?? undefined,
            dueDate: task.dueDate ?? null,
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
          .filter((task) => task.title.length > 0)
      : null;

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
        const prompt = `${systemPrompt}\n\nJournal note:\n"""\n${trimmedEntry}\n"""`;

        const { object } = await generateObject({
          model: google('gemini-2.5-flash-lite'),
          schema: quickJournalTaskSchema,
          prompt,
        });

        aiTasks = (object.tasks || [])
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
      } catch (generationError) {
        console.error('Quick journal AI generation failed:', generationError);
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

    const candidateTasks: CandidateTask[] = [];

    for (const task of sourceTasks) {
      if (candidateTasks.length >= MAX_AI_TASKS) {
        break;
      }

      const trimmedTitle = task.title?.trim().slice(0, MAX_TITLE_LENGTH) ?? '';
      if (!trimmedTitle) {
        continue;
      }

      const formattedTitle =
        trimmedTitle[0]?.toUpperCase() + trimmedTitle.slice(1);

      const rawDescription = (task.description ?? '')
        .trim()
        .slice(0, MAX_DESCRIPTION_LENGTH);

      const descriptionValue = generateDescriptions ? rawDescription : '';

      const priorityValue =
        generatePriority && task.priority && isTaskPriority(task.priority)
          ? task.priority
          : null;

      const seedSuggestions =
        generateLabels && Array.isArray(task.labelSuggestions)
          ? task.labelSuggestions.filter(Boolean)
          : [];

      const labelSuggestions = generateLabels
        ? deriveLabelSuggestions(
            formattedTitle,
            rawDescription,
            seedSuggestions
          )
        : [];

      const labelsPayload: ProvidedLabel[] = Array.isArray((task as any).labels)
        ? (task as any).labels
        : [];

      const dueDateValue = normalizeDueDate(
        (task as any).dueDate ?? null,
        timezoneContext
      );

      candidateTasks.push({
        title: formattedTitle,
        description: descriptionValue,
        priority: priorityValue,
        labelSuggestions,
        labels: labelsPayload,
        dueDate: dueDateValue,
      });
    }

    if (!candidateTasks.length) {
      return NextResponse.json(
        { error: 'No valid tasks were generated from this journal entry.' },
        { status: 422 }
      );
    }

    if (previewOnly || !listCheck) {
      const previewPayload = candidateTasks.map((task, index) => ({
        id: `preview-${index}`,
        name: task.title,
        description: task.description || null,
        priority: task.priority ?? null,
        labelSuggestions: task.labelSuggestions,
        dueDate: task.dueDate,
        labels: task.labels,
      }));

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

    const labelNameMap = new Map<
      string,
      { id: string; name: string; color: string }
    >();

    if (!previewOnly) {
      const { data: existingLabels, error: labelsError } = await supabase
        .from('workspace_task_labels')
        .select('id, name, color')
        .eq('ws_id', wsId);

      if (labelsError) {
        console.error('Error fetching workspace labels:', labelsError);
        return NextResponse.json(
          { error: 'Failed to load workspace labels' },
          { status: 500 }
        );
      }

      (existingLabels ?? []).forEach((label) => {
        const normalized = normalizeLabelName(label.name);
        if (normalized) {
          labelNameMap.set(normalized, label);
        }
      });
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
      archived: false,
      deleted: false,
      completed: false,
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
