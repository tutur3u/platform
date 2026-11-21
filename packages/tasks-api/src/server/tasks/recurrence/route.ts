import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { deriveTaskDescriptionYjsState } from '@tuturuuu/utils/yjs-task-description';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTaskBoardAccess } from '../../board-access';
import { planRecurrenceStep } from './plan';
import {
  issueRecurrenceReceipt,
  recurrenceReceiptKey,
  verifyRecurrenceReceipt,
} from './receipt';
import {
  completionPlanInput,
  prepareCreateResult,
  recurrenceRequest,
} from './schema';

export const MAX_RECURRENCE_REQUEST_BYTES = 128 * 1024;

type Session = { user: SupabaseUser; supabase: TypedSupabaseClient };
type DbError = { code: string; message: string };

const unavailable = () =>
  response({ error: 'TASK_RECURRENCE_UNAVAILABLE' }, 404);
const invalid = () => response({ error: 'TASK_RECURRENCE_REQUEST' }, 400);

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

function dbResponse({ data, error }: { data: unknown; error: DbError | null }) {
  if (!error) return response(data);
  if (/^PT(400|403|404|409|429)$/.test(error.code)) {
    return response({ error: error.message }, Number(error.code.slice(2)));
  }
  if (['55P03', '57014', '40P01'].includes(error.code)) {
    return response({ error: 'TASK_RECURRENCE_RETRY' }, 409);
  }
  if (error.code === 'PGRST202') return unavailable();
  console.error('Task recurrence request failed', { code: error.code });
  return response({ error: 'TASK_RECURRENCE_FAILED' }, 500);
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RECURRENCE_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return recurrenceRequest.safeParse(JSON.parse(text + decoder.decode()));
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function handleTaskRecurrence(
  request: Request,
  rawWorkspace: string,
  session: Session,
  receiptSecret: string | undefined
) {
  const parsed = await readBody(request);
  if (!parsed?.success) return invalid();
  const body = parsed.data;
  if (rawWorkspace !== 'personal' && !z.uuid().safeParse(rawWorkspace).success)
    return invalid();

  const ws = await normalizeWorkspaceId(rawWorkspace, session.supabase);
  const actor = session.user.id;
  const admin = await createAdminClient();
  const membership = await admin
    .from('workspace_members')
    .select('type')
    .eq('ws_id', ws)
    .eq('user_id', actor)
    .maybeSingle();
  if (membership.error) return dbResponse(membership);
  if (membership.data?.type !== 'MEMBER') return unavailable();

  const rpc = admin.schema('private');
  const identity = { p_ws: ws, p_actor: actor };
  if (body.operation === 'read') {
    return dbResponse(
      await rpc.rpc('task_recurrence_read', {
        ...identity,
        p_tasks: body.taskIds,
        p_include_template: body.includeTemplate,
      })
    );
  }

  const secret = recurrenceReceiptKey(receiptSecret);
  if (!secret) return unavailable();
  let target: { listId: string } | { taskId: string } | { boardId: string };
  if (body.operation === 'create' || body.operation === 'prepare') {
    target = { listId: body.listId };
  } else if (body.operation === 'status' && body.action === 'delete') {
    const task = await admin
      .from('tasks')
      .select('task_lists!inner(board_id,workspace_boards!inner(ws_id))')
      .eq('id', body.taskId)
      .eq('task_lists.workspace_boards.ws_id', ws)
      .maybeSingle();
    if (task.error) return dbResponse(task);
    if (!task.data?.task_lists?.board_id) return unavailable();
    target = { boardId: task.data.task_lists.board_id };
  } else {
    target = { taskId: body.taskId };
  }
  const access = await resolveTaskBoardAccess({
    ...session,
    sbAdmin: admin,
    wsId: ws,
    requiredPermission: 'edit',
    ...target,
  });
  if ('error' in access || access.access.mode !== 'member')
    return unavailable();

  if (body.operation === 'prepareTask') {
    const loaded = await rpc.rpc('task_recurrence_read', {
      ...identity,
      p_tasks: [body.taskId],
      p_include_template: false,
    });
    if (loaded.error) return dbResponse(loaded);
    if (!Array.isArray(loaded.data) || loaded.data.length !== 1)
      return unavailable();
    return response({ receipt: issueRecurrenceReceipt(secret, ws, actor) });
  }

  if (body.operation === 'prepare' || body.operation === 'create') {
    const args = { ...identity, p_list: body.listId };
    const prepared = await rpc.rpc('task_recurrence_prepare_create', args);
    if (prepared.error) return dbResponse(prepared);
    if (body.operation === 'prepare') {
      return response({ receipt: issueRecurrenceReceipt(secret, ws, actor) });
    }
    const receipt = verifyRecurrenceReceipt(secret, ws, actor, body.receipt);
    if (!receipt)
      return response({ error: 'TASK_RECURRENCE_RECEIPT_EXPIRED' }, 409);
    const gates = prepareCreateResult.safeParse(prepared.data);
    if (!gates.success) return unavailable();
    const { schedule, template } = body.spec;
    return dbResponse(
      await rpc.rpc('task_recurrence_create', {
        ...args,
        ...receipt,
        p_global_epoch: gates.data.global_epoch,
        p_ws_epoch: gates.data.workspace_epoch,
        p_spec: {
          rule: schedule.rule,
          anchor_date: schedule.anchorDate,
          due_time: schedule.dueTime,
          start_offset_days: schedule.startOffsetDays,
          template,
        },
        p_plan: {
          ...planRecurrenceStep(schedule),
          description_state: deriveTaskDescriptionYjsState(
            template.description
          ),
        },
      })
    );
  }

  const receipt = verifyRecurrenceReceipt(secret, ws, actor, body.receipt);
  if (!receipt)
    return response({ error: 'TASK_RECURRENCE_RECEIPT_EXPIRED' }, 409);
  if (body.operation === 'complete') {
    const captured = await rpc.rpc('task_recurrence_begin_completion', {
      ...identity,
      ...receipt,
      p_task: body.taskId,
      p_list: body.listId,
      p_sort_key: body.sortKey ?? 0,
    });
    if (captured.error) return dbResponse(captured);
    const captureStatus = z
      .object({ pending: z.boolean().optional() })
      .safeParse(captured.data);
    if (!captureStatus.success) return unavailable();
    if (captureStatus.data.pending !== true) return response(captured.data);
    const prepared = await rpc.rpc('task_recurrence_prepare_completion', {
      ...identity,
      p_request: receipt.p_request,
      p_task: body.taskId,
    });
    if (prepared.error)
      return response({ status: 'completed', generation: 'deferred' });
    const planInput = completionPlanInput.safeParse(prepared.data);
    const item = {
      task_id: body.taskId,
      list_id: body.listId,
      sort_key: body.sortKey ?? 0,
      transition_id: null as string | null,
      plan: null as
        | (Omit<ReturnType<typeof planRecurrenceStep>, 'anchor_at'> & {
            description_state: number[] | null;
          })
        | null,
    };
    if (planInput.success) {
      const source = planInput.data;
      const { anchor_at: _anchor, ...plan } = planRecurrenceStep(
        {
          rule: source.rule,
          anchorDate: source.anchor_date,
          dueTime: source.due_time,
          startOffsetDays: source.start_offset_days,
        },
        source.cursor_date,
        source.consumed_count
      );
      item.transition_id = source.transition_id;
      item.plan = {
        ...plan,
        description_state: deriveTaskDescriptionYjsState(source.description),
      };
    }
    const generated = await rpc.rpc('task_recurrence_complete', {
      ...identity,
      ...receipt,
      p_items: [item],
    });
    if (generated.error && generated.error.code !== 'PT409') {
      return response({ status: 'completed', generation: 'deferred' });
    }
    return dbResponse(generated);
  }

  const version = {
    ...identity,
    ...receipt,
    p_series: body.seriesId,
    p_task: body.taskId,
    p_revision: body.revision,
    p_progress: body.progress,
  };
  if (body.operation === 'edit') {
    const { schedule, template } = body.spec;
    return dbResponse(
      await rpc.rpc('task_recurrence_edit', {
        ...version,
        p_spec: {
          rule: schedule.rule,
          anchor_date: schedule.anchorDate,
          due_time: schedule.dueTime,
          start_offset_days: schedule.startOffsetDays,
          template,
        },
        p_plan: planRecurrenceStep(schedule),
      })
    );
  }
  if (body.deleteTask && body.action !== 'delete') return invalid();
  return dbResponse(
    await rpc.rpc('task_recurrence_set_status', {
      ...version,
      p_action: body.action,
      p_delete_task: body.deleteTask
        ? body.taskId
        : '00000000-0000-0000-0000-000000000000',
      p_plan: null,
    })
  );
}
