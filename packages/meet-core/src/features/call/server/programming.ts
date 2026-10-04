import 'server-only';
import { resolveProgrammingLearnerAccess } from '@tuturuuu/education-core/education/programming-access';
import { enqueueProgrammingExecution } from '@tuturuuu/education-core/education/programming-execution';
import { createProgrammingRepository } from '@tuturuuu/education-core/education/programming-repository';
import { getProgrammingProblem } from '@tuturuuu/education-core/education/programming-service';
import {
  type MeetingProgramming,
  meetingProgrammingSchema,
} from '@tuturuuu/realtime/meet';
import { playgroundPreviewResponse } from '@tuturuuu/storage-core/playground-preview';
import {
  createPlayground,
  executePlayground,
  getPlayground,
  getPlaygroundMetadata,
  getPlaygroundRun,
} from '@tuturuuu/storage-core/playground-service';
import { programmingRoomTicket } from '@tuturuuu/storage-core/programming-collaboration';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { accountPrivateRpc } from '@tuturuuu/utils/account-benefits-server';
import { playgroundTemplates } from '@tuturuuu/utils/playground-templates';
import { z } from 'zod';
import { MeetCallAccessError } from '../lib/call-access';
import { callRoomService } from './room-service';

type Access = Parameters<typeof callRoomService>[0];
async function elevated(access: Access) {
  return accountPrivateRpc<boolean>('meeting_programming_elevated', {
    p_meeting_id: access.meeting.id,
    p_owner_id: access.meeting.creator_id,
  });
}
async function selected(access: Access) {
  return (
    await callRoomService<{ selection: MeetingProgramming | null }>(access, {
      action: 'programming.read',
    })
  ).selection;
}
async function problemAccess(access: Access, id: string) {
  const context = {
    user: access.user,
    supabase: await createAdminClient({ noCookie: true }),
  };
  const subject = (await elevated(access))
    ? {
        wsId: access.meeting.ws_id,
        studentPlatformUserId: access.user.id,
        readOnly: false,
      }
    : await resolveProgrammingLearnerAccess({
        context,
        wsId: access.meeting.ws_id,
      });
  const problem = await getProgrammingProblem(
    await createProgrammingRepository(),
    { actorId: access.user.id, wsId: subject.wsId, mode: 'learner' },
    id
  );
  return { context, subject, problem };
}
export async function setMeetingProgramming(access: Access, payload: unknown) {
  if (!access.isHost)
    throw new MeetCallAccessError(403, 'Host access required');
  await selected(access); // Lifecycle and admission must succeed before resource lookup.
  const selection = meetingProgrammingSchema.nullable().parse(payload);
  if (selection?.kind === 'playground') {
    if (
      !(await elevated(access)) &&
      !(await accountPrivateRpc<boolean>('account_playgrounds_allowed', {
        p_actor_id: access.user.id,
      }))
    )
      throw new MeetCallAccessError(403, 'Playground access required');
    const project = await getPlayground(access.user.id, selection.id);
    if (project.language !== selection.language)
      throw new MeetCallAccessError(400, 'Invalid project language');
  } else if (selection) await problemAccess(access, selection.id);
  return callRoomService(access, { action: 'programming.set', selection });
}
async function authorizePlayground(access: Access) {
  const selection = await selected(access);
  if (selection?.kind !== 'playground')
    throw new MeetCallAccessError(409, 'Select a playground');
  const ownerId = access.meeting.creator_id!;
  const override = await elevated(access);
  if (!override) {
    const allowed = await Promise.all(
      [ownerId, access.user.id].map((id) =>
        accountPrivateRpc<boolean>('account_playgrounds_allowed', {
          p_actor_id: id,
        })
      )
    );
    if (allowed.some((value) => !value))
      throw new MeetCallAccessError(403, 'Playground access required');
  }
  await getPlaygroundMetadata(ownerId, selection.id);
  return {
    ownerId,
    projectId: selection.id,
    meetingId: override ? access.meeting.id : undefined,
  };
}
export async function previewMeetingPlayground(
  access: Access,
  port: number,
  path: string,
  prefix: string
) {
  return playgroundPreviewResponse({
    ...(await authorizePlayground(access)),
    roomId: access.meeting.id,
    port,
    path,
    prefix,
  });
}
export async function joinMeetingProgramming(
  access: Access,
  checkpoint = false
) {
  const selection = await selected(access);
  if (!selection) return { selection: null };
  const ownerId = access.meeting.creator_id!;
  const override = await elevated(access);
  const scope = {
    actorId: access.user.id,
    ownerId,
    resourceId: selection.id,
    resource: selection.kind,
    meetingId: override ? access.meeting.id : undefined,
    roomId:
      selection.kind === 'playground'
        ? override
          ? `meeting:${access.meeting.id}:playground:${selection.id}`
          : `playground:${selection.id}`
        : `meeting:${access.meeting.id}:${selection.kind}:${selection.id}:${selection.language}`,
    displayName: access.displayName,
  };
  if (selection.kind === 'playground') {
    const entitled = await Promise.all(
      [ownerId, access.user.id].map((id) =>
        accountPrivateRpc<boolean>('account_playgrounds_allowed', {
          p_actor_id: id,
        })
      )
    );
    if (!override && entitled.some((value) => !value))
      throw new MeetCallAccessError(403, 'Playground access required');
    const project = {
      ...(await getPlaygroundMetadata(ownerId, selection.id)),
      files: [],
    };
    const ticket = await programmingRoomTicket(
      { ...scope, role: access.isHost ? 'owner' : 'editor' },
      () => getPlayground(ownerId, selection.id),
      checkpoint
    );
    return { ...ticket, project, selection };
  }
  const { subject, problem } = await problemAccess(access, selection.id);
  const template = playgroundTemplates[selection.language];
  const project = {
    id: problem.id,
    name: problem.title.en,
    language: selection.language,
    revision: 0,
    drivePath: null,
    files: [
      {
        path: template.path,
        content:
          selection.language === 'python'
            ? problem.starterCode
            : template.content,
      },
    ],
    command: template.command,
    activeRun: null,
  };
  const ticket = await programmingRoomTicket(
    {
      ...scope,
      role: subject.readOnly ? 'viewer' : access.isHost ? 'owner' : 'editor',
    },
    project
  );
  return { ...ticket, project, selection, problem };
}
export async function testMeetingProgramming(access: Access, payload: unknown) {
  const selection = await selected(access);
  if (selection?.kind !== 'problem')
    throw new MeetCallAccessError(409, 'Select a programming problem');
  const { context } = await problemAccess(access, selection.id);
  const source = z
    .object({ source: z.string().min(1).max(16000) })
    .strict()
    .parse(payload).source;
  const id = (await elevated(access))
    ? await accountPrivateRpc<string>('enqueue_meeting_programming_test', {
        p_meeting_id: access.meeting.id,
        p_actor_id: access.user.id,
        p_problem_id: selection.id,
        p_source: source,
        p_language: selection.language,
      })
    : await enqueueProgrammingExecution(
        context,
        access.meeting.ws_id,
        undefined,
        {
          problemId: selection.id,
          language: selection.language,
          source,
          kind: 'test',
        }
      );
  return { id };
}
export async function readMeetingProgrammingTest(access: Access, id: string) {
  const selection = await selected(access);
  if (selection?.kind !== 'problem')
    throw new MeetCallAccessError(409, 'Select a programming problem');
  const { subject } = await problemAccess(access, selection.id);
  return accountPrivateRpc<{ status: string; output: string | null }>(
    'read_collaborative_programming_test',
    {
      p_actor_id: subject.studentPlatformUserId,
      p_ws_id: subject.wsId,
      p_problem_id: selection.id,
      p_submission_id: z.uuid().parse(id),
    }
  );
}

export async function createMeetingPlayground(
  access: Access,
  payload: unknown
) {
  if (!access.isHost)
    throw new MeetCallAccessError(403, 'Host access required');
  await selected(access);
  return createPlayground(
    access.user.id,
    payload,
    (await elevated(access)) ? access.meeting.id : undefined
  );
}
export async function executeMeetingPlayground(
  access: Access,
  payload: unknown
) {
  const selection = await selected(access);
  if (selection?.kind !== 'playground')
    throw new MeetCallAccessError(409, 'Select a playground');
  await authorizePlayground(access);
  const parsed = z
    .object({
      operation: z.enum(['run', 'stop']),
      requestId: z.uuid(),
      stdin: z.string().max(65536).optional(),
    })
    .strict()
    .parse(payload);
  return executePlayground(
    access.meeting.creator_id!,
    selection.id,
    parsed.operation,
    parsed.requestId,
    { stdin: parsed.stdin },
    (await elevated(access)) ? access.meeting.id : undefined
  );
}
export async function readMeetingPlaygroundRun(access: Access, runId: string) {
  const selection = await selected(access);
  if (selection?.kind !== 'playground')
    throw new MeetCallAccessError(409, 'Select a playground');
  await authorizePlayground(access);
  const { preview: _preview, ...result } = await getPlaygroundRun(
    access.meeting.creator_id!,
    selection.id,
    z.uuid().parse(runId)
  );
  return result;
}
