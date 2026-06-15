import { Buffer } from 'node:buffer';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { TaskActorRpcArgs } from '@tuturuuu/types/db';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { ZodError, type z } from 'zod';
import {
  paramsSchema,
  TASK_DESCRIPTION_CHUNK_FIELDS,
  taskDescriptionChunkRequestSchema,
  updateTaskDescriptionSchema,
} from './schema';

type PersistedTaskDescription = {
  description: string | null;
  description_yjs_state: number[] | null;
  id: string;
};
type TaskDescriptionUpdateBody = z.infer<typeof updateTaskDescriptionSchema>;
type TaskDescriptionChunkRequest = z.infer<
  typeof taskDescriptionChunkRequestSchema
>;
type ChunkField = (typeof TASK_DESCRIPTION_CHUNK_FIELDS)[number];
type ChunkFieldPlan = {
  chunk_count: number;
  total_length: number;
  is_null?: boolean;
};
type ChunkSessionFields = Partial<Record<ChunkField, ChunkFieldPlan>>;
type ChunkSessionRow = {
  fields: ChunkSessionFields;
  id: string;
  task_id: string;
  user_id: string;
};
type ChunkRow = {
  chunk: string;
  chunk_index: number;
  field: ChunkField;
};
type PrivateChunkClient = {
  from: (table: string) => any;
};

async function fetchPersistedTaskDescription(
  sbAdmin: TypedSupabaseClient,
  taskId: string
) {
  return sbAdmin
    .from('tasks')
    .select('id, description, description_yjs_state')
    .eq('id', taskId)
    .maybeSingle();
}

function normalizePersistedTaskDescription(
  data: PersistedTaskDescription | null | undefined,
  taskId: string
): PersistedTaskDescription | null {
  return data && data.id === taskId
    ? {
        description: data.description,
        description_yjs_state: data.description_yjs_state,
        id: data.id,
      }
    : null;
}

async function persistTaskDescriptionYjsState({
  sbAdmin,
  taskId,
  yjsState,
}: {
  sbAdmin: TypedSupabaseClient;
  taskId: string;
  yjsState: number[] | null;
}) {
  return sbAdmin
    .from('tasks')
    .update({ description_yjs_state: yjsState })
    .eq('id', taskId)
    .select('id, description, description_yjs_state')
    .maybeSingle();
}

async function deriveTaskDescriptionYjsState(
  description: string | null | undefined
) {
  const { deriveTaskDescriptionYjsState: deriveYjsState } = await import(
    '@tuturuuu/utils/yjs-task-description'
  );

  return deriveYjsState(description);
}

async function validateTaskDescriptionYjsState(
  yjsState: number[] | null | undefined
) {
  const { isValidTaskDescriptionYjsState } = await import(
    '@tuturuuu/utils/yjs-task-description'
  );

  return isValidTaskDescriptionYjsState(yjsState);
}

function getPrivateChunkClient(sbAdmin: TypedSupabaseClient) {
  return sbAdmin.schema('private') as unknown as PrivateChunkClient;
}

async function parseJsonBody(request: NextRequest) {
  try {
    return { body: await request.json() };
  } catch {
    return {
      error: NextResponse.json(
        { error: 'Invalid request data', details: 'Malformed JSON body' },
        { status: 400 }
      ),
    };
  }
}

async function cleanupExpiredChunkSessions(privateDb: PrivateChunkClient) {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await privateDb
    .from('task_description_chunk_sessions')
    .delete()
    .lt('created_at', cutoff);
}

async function loadChunkSession({
  privateDb,
  sessionId,
  taskId,
  userId,
}: {
  privateDb: PrivateChunkClient;
  sessionId: string;
  taskId: string;
  userId: string;
}) {
  const { data, error } = await privateDb
    .from('task_description_chunk_sessions')
    .select('id, task_id, user_id, fields')
    .eq('id', sessionId)
    .eq('task_id', taskId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: 'Failed to load task description chunk session' },
        { status: 500 }
      ),
    };
  }

  if (!data) {
    return {
      error: NextResponse.json(
        { error: 'Task description chunk session not found' },
        { status: 404 }
      ),
    };
  }

  return { session: data as ChunkSessionRow };
}

async function persistTaskDescriptionUpdate({
  body,
  sbAdmin,
  taskId,
  userId,
}: {
  body: TaskDescriptionUpdateBody;
  sbAdmin: TypedSupabaseClient;
  taskId: string;
  userId: string;
}) {
  if (
    body.description_yjs_state !== undefined &&
    !(await validateTaskDescriptionYjsState(body.description_yjs_state))
  ) {
    return NextResponse.json(
      {
        error: 'Invalid request data',
        details: [
          {
            code: 'custom',
            message:
              'Task description Yjs state is not compatible with the editor schema',
            path: ['description_yjs_state'],
          },
        ],
      },
      { status: 400 }
    );
  }

  const normalizedDescription =
    body.description !== undefined
      ? body.description?.trim() || null
      : undefined;
  const normalizedYjsState =
    body.description_yjs_state !== undefined
      ? body.description_yjs_state
      : normalizedDescription !== undefined
        ? await deriveTaskDescriptionYjsState(normalizedDescription)
        : undefined;

  let persistedTaskDescription: PersistedTaskDescription | null = null;

  if (normalizedDescription !== undefined) {
    const updateTaskPayload: TaskActorRpcArgs<'update_task_fields_with_actor'> =
      {
        p_task_id: taskId,
        p_task_updates: { description: normalizedDescription },
        p_actor_user_id: userId,
      };
    const { data, error } = await sbAdmin
      .rpc('update_task_fields_with_actor', updateTaskPayload)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update task description' },
        { status: 500 }
      );
    }

    persistedTaskDescription = normalizePersistedTaskDescription(
      data as PersistedTaskDescription | null,
      taskId
    );
  }

  if (normalizedYjsState !== undefined) {
    const { data, error } = await persistTaskDescriptionYjsState({
      sbAdmin,
      taskId,
      yjsState: normalizedYjsState,
    });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update task description state' },
        { status: 500 }
      );
    }

    persistedTaskDescription = normalizePersistedTaskDescription(
      data as PersistedTaskDescription | null,
      taskId
    );
  }

  if (!persistedTaskDescription) {
    // The actor RPC can be idempotent when the description is already current.
    // Read the row back so close-time saves are confirmed by the persisted
    // task description instead of failing as "not found".
    const { data: confirmedTask, error: confirmError } =
      await fetchPersistedTaskDescription(sbAdmin, taskId);

    if (confirmError) {
      return NextResponse.json(
        { error: 'Failed to confirm task description update' },
        { status: 500 }
      );
    }

    if (!confirmedTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    persistedTaskDescription = confirmedTask;
  }

  return NextResponse.json({
    description: persistedTaskDescription.description,
    description_yjs_state: persistedTaskDescription.description_yjs_state,
  });
}

async function handleBeginChunks({
  fields,
  privateDb,
  taskId,
  userId,
}: {
  fields: ChunkSessionFields;
  privateDb: PrivateChunkClient;
  taskId: string;
  userId: string;
}) {
  await cleanupExpiredChunkSessions(privateDb);

  const { data, error } = await privateDb
    .from('task_description_chunk_sessions')
    .insert({
      fields,
      task_id: taskId,
      user_id: userId,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    return NextResponse.json(
      { error: 'Failed to begin task description chunk session' },
      { status: 500 }
    );
  }

  return NextResponse.json({ session_id: data.id });
}

async function handleAppendChunk({
  body,
  privateDb,
  taskId,
  userId,
}: {
  body: Extract<TaskDescriptionChunkRequest, { action: 'append' }>;
  privateDb: PrivateChunkClient;
  taskId: string;
  userId: string;
}) {
  const sessionResult = await loadChunkSession({
    privateDb,
    sessionId: body.session_id,
    taskId,
    userId,
  });
  if ('error' in sessionResult) return sessionResult.error;

  const fieldPlan = sessionResult.session.fields[body.field];
  if (!fieldPlan || fieldPlan.is_null) {
    return NextResponse.json(
      { error: 'Chunk field is not part of this session' },
      { status: 400 }
    );
  }

  if (body.chunk_index >= fieldPlan.chunk_count) {
    return NextResponse.json(
      { error: 'Chunk index is outside the declared range' },
      { status: 400 }
    );
  }

  const { error } = await privateDb.from('task_description_chunks').upsert(
    {
      chunk: body.chunk,
      chunk_index: body.chunk_index,
      field: body.field,
      session_id: body.session_id,
    },
    { onConflict: 'session_id,field,chunk_index' }
  );

  if (error) {
    return NextResponse.json(
      { error: 'Failed to append task description chunk' },
      { status: 500 }
    );
  }

  await privateDb
    .from('task_description_chunk_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', body.session_id);

  return NextResponse.json({ success: true });
}

function assembleChunkField({
  chunks,
  field,
  plan,
}: {
  chunks: ChunkRow[];
  field: ChunkField;
  plan: ChunkFieldPlan;
}) {
  if (plan.is_null) {
    return { value: null };
  }

  const fieldChunks = chunks
    .filter((chunk) => chunk.field === field)
    .sort((a, b) => a.chunk_index - b.chunk_index);

  if (fieldChunks.length !== plan.chunk_count) {
    return { error: 'Missing task description chunks' };
  }

  for (let index = 0; index < plan.chunk_count; index += 1) {
    if (fieldChunks[index]?.chunk_index !== index) {
      return { error: 'Task description chunks are out of sequence' };
    }
  }

  const value = fieldChunks.map((chunk) => chunk.chunk).join('');

  if (value.length !== plan.total_length) {
    return { error: 'Task description chunk length mismatch' };
  }

  return { value };
}

async function handleCommitChunks({
  privateDb,
  sbAdmin,
  sessionId,
  taskId,
  userId,
}: {
  privateDb: PrivateChunkClient;
  sbAdmin: TypedSupabaseClient;
  sessionId: string;
  taskId: string;
  userId: string;
}) {
  const sessionResult = await loadChunkSession({
    privateDb,
    sessionId,
    taskId,
    userId,
  });
  if ('error' in sessionResult) return sessionResult.error;

  const { data, error } = await privateDb
    .from('task_description_chunks')
    .select('field, chunk_index, chunk')
    .eq('session_id', sessionId);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to load task description chunks' },
      { status: 500 }
    );
  }

  const chunks = (data ?? []) as ChunkRow[];
  const updatePayload: {
    description?: string | null;
    description_yjs_state?: number[] | null;
  } = {};

  for (const field of TASK_DESCRIPTION_CHUNK_FIELDS) {
    const plan = sessionResult.session.fields[field];
    if (!plan) continue;

    const assembled = assembleChunkField({ chunks, field, plan });
    if ('error' in assembled) {
      return NextResponse.json({ error: assembled.error }, { status: 400 });
    }

    if (field === 'description') {
      updatePayload.description = assembled.value;
    } else if (assembled.value === null) {
      updatePayload.description_yjs_state = null;
    } else {
      updatePayload.description_yjs_state = Array.from(
        Buffer.from(assembled.value, 'base64')
      );
    }
  }

  const parsed = updateTaskDescriptionSchema.safeParse(updatePayload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request data', details: parsed.error.issues },
      { status: 400 }
    );
  }

  const response = await persistTaskDescriptionUpdate({
    body: parsed.data,
    sbAdmin,
    taskId,
    userId,
  });

  if (response.ok) {
    await privateDb
      .from('task_description_chunk_sessions')
      .delete()
      .eq('id', sessionId);
  }

  return response;
}

async function handleAbortChunks({
  privateDb,
  sessionId,
  taskId,
  userId,
}: {
  privateDb: PrivateChunkClient;
  sessionId: string;
  taskId: string;
  userId: string;
}) {
  const { error } = await privateDb
    .from('task_description_chunk_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('task_id', taskId)
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to abort task description chunk session' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

async function requireWorkspaceTaskAccess(
  request: NextRequest,
  rawParams: unknown
) {
  const { wsId: rawWsId, taskId } = paramsSchema.parse(rawParams);
  const supabase = await createClient(request);

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const memberCheck = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: user.id,
    supabase: supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (!memberCheck.ok) {
    return {
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  const sbAdmin = await createAdminClient();
  const { data: taskContext, error: taskError } = await sbAdmin
    .from('tasks')
    .select(
      `
      id,
      task_lists!inner (
        workspace_boards!inner (
          ws_id
        )
      )
    `
    )
    .eq('id', taskId)
    .is('deleted_at', null)
    .maybeSingle();

  if (taskError) {
    return {
      error: NextResponse.json(
        { error: 'Failed to load task' },
        { status: 500 }
      ),
    };
  }

  if (
    !taskContext ||
    taskContext.task_lists?.workspace_boards?.ws_id !== wsId
  ) {
    return {
      error: NextResponse.json({ error: 'Task not found' }, { status: 404 }),
    };
  }

  return { sbAdmin, taskId, user };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const access = await requireWorkspaceTaskAccess(request, await params);
    if ('error' in access) return access.error;

    const { sbAdmin, taskId } = access;
    const { data, error } = await fetchPersistedTaskDescription(
      sbAdmin,
      taskId
    );

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch task description' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({
      description: data.description,
      description_yjs_state: data.description_yjs_state,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const access = await requireWorkspaceTaskAccess(request, await params);
    if ('error' in access) return access.error;

    const { sbAdmin, taskId, user } = access;
    const parsedJson = await parseJsonBody(request);
    if ('error' in parsedJson) return parsedJson.error;

    const rawBody = parsedJson.body;
    const hasChunkAction =
      rawBody !== null && typeof rawBody === 'object' && 'action' in rawBody;

    if (hasChunkAction) {
      const body = taskDescriptionChunkRequestSchema.parse(rawBody);
      const privateDb = getPrivateChunkClient(sbAdmin);

      switch (body.action) {
        case 'begin':
          return handleBeginChunks({
            fields: body.fields,
            privateDb,
            taskId,
            userId: user.id,
          });
        case 'append':
          return handleAppendChunk({
            body,
            privateDb,
            taskId,
            userId: user.id,
          });
        case 'commit':
          return handleCommitChunks({
            privateDb,
            sbAdmin,
            sessionId: body.session_id,
            taskId,
            userId: user.id,
          });
        case 'abort':
          return handleAbortChunks({
            privateDb,
            sessionId: body.session_id,
            taskId,
            userId: user.id,
          });
      }
    }

    const body = updateTaskDescriptionSchema.parse(rawBody);
    return persistTaskDescriptionUpdate({
      body,
      sbAdmin,
      taskId,
      userId: user.id,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
