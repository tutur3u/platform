import 'server-only';
import { resolveProgrammingLearnerAccess } from '@tuturuuu/education-core/education/programming-access';
import { enqueueProgrammingExecution } from '@tuturuuu/education-core/education/programming-execution';
import { createProgrammingRepository } from '@tuturuuu/education-core/education/programming-repository';
import { getProgrammingProblem } from '@tuturuuu/education-core/education/programming-service';
import {
  type MeetingProgramming,
  type ProgrammingMiraPresence,
  programmingMiraAnswerSchema,
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
import { PlaygroundCreate } from '@tuturuuu/utils/playground-schema';
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
export async function selectedProgrammingMira(access: Access) {
  return callRoomService<{
    selection: MeetingProgramming | null;
    generation: string | null;
    miraPresence: ProgrammingMiraPresence | null;
    voiceDraft: {
      id: string;
      answer: z.infer<typeof programmingMiraAnswerSchema> | null;
    } | null;
  }>(access, { action: 'programming.read', mira: true });
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
  return callRoomService(access, {
    action: 'programming.set',
    selection,
    generation: crypto.randomUUID(),
  });
}
async function authorizePlayground(
  access: Access,
  knownSelection?: MeetingProgramming
) {
  const selection = knownSelection ?? (await selected(access));
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
  const project = await getPlaygroundMetadata(ownerId, selection.id);
  if (project.language !== selection.language)
    throw new MeetCallAccessError(409, 'Playground language changed');
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
async function meetingProgrammingScope(
  access: Access,
  selection: MeetingProgramming,
  knownOverride?: boolean
) {
  const ownerId = access.meeting.creator_id!;
  const override = knownOverride ?? (await elevated(access));
  return {
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
}

export async function authorizeProgrammingMira(
  access: Access,
  selection: MeetingProgramming
) {
  if (selection.kind === 'playground') {
    const project = await authorizePlayground(access, selection);
    const scope = await meetingProgrammingScope(
      access,
      selection,
      !!project.meetingId
    );
    return {
      ...scope,
      role: access.isHost ? ('owner' as const) : ('editor' as const),
    };
  }
  const { subject } = await problemAccess(access, selection.id);
  const scope = await meetingProgrammingScope(access, selection);
  return {
    ...scope,
    role: subject.readOnly
      ? ('viewer' as const)
      : access.isHost
        ? ('owner' as const)
        : ('editor' as const),
  };
}

export async function joinMeetingProgramming(
  access: Access,
  checkpoint = false
) {
  const selection = await selected(access);
  if (!selection) return { selection: null };
  const scope = await meetingProgrammingScope(access, selection);
  const { ownerId, meetingId: elevatedMeetingId } = scope;
  if (selection.kind === 'playground') {
    const entitled = await Promise.all(
      [ownerId, access.user.id].map((id) =>
        accountPrivateRpc<boolean>('account_playgrounds_allowed', {
          p_actor_id: id,
        })
      )
    );
    if (!elevatedMeetingId && entitled.some((value) => !value))
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
  const role = subject.readOnly ? 'viewer' : access.isHost ? 'owner' : 'editor';
  if (checkpoint && role !== 'owner')
    throw new MeetCallAccessError(
      403,
      'Only the host can checkpoint a problem'
    );
  const ticket = await programmingRoomTicket(
    { ...scope, role },
    project,
    checkpoint
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
const publicJudgeResult = z.object({
  results: z
    .array(
      z.object({
        index: z.number().int().min(0).max(9),
        passed: z.boolean(),
        visible: z.boolean(),
        output: z.string().optional(),
        stderr: z.string().optional(),
        reason: z.string(),
      })
    )
    .max(10),
});

export async function readMeetingProgrammingTest(access: Access, id: string) {
  const selection = await selected(access);
  if (selection?.kind !== 'problem')
    throw new MeetCallAccessError(409, 'Select a programming problem');
  const { subject } = await problemAccess(access, selection.id);
  const result = await accountPrivateRpc<{
    status: string;
    output: string | null;
  }>('read_collaborative_programming_test', {
    p_actor_id: subject.studentPlatformUserId,
    p_ws_id: subject.wsId,
    p_problem_id: selection.id,
    p_submission_id: z.uuid().parse(id),
  });
  let cases: z.infer<typeof publicJudgeResult>['results'] = [];
  try {
    const judge = publicJudgeResult.safeParse(
      JSON.parse(result.output ?? 'null')
    );
    if (judge.success)
      cases = judge.data.results.filter((item) => item.visible);
  } catch {
    // A judge without a structured result still reports its run status.
  }
  return { ...result, cases };
}

export async function createMeetingPlayground(
  access: Access,
  payload: unknown
) {
  if (!access.isHost)
    throw new MeetCallAccessError(403, 'Host access required');
  await selected(access);
  const parsed = PlaygroundCreate.extend({
    empty: z.boolean().optional(),
  }).parse(payload);
  return createPlayground(
    access.user.id,
    { name: parsed.name, language: parsed.language },
    (await elevated(access)) ? access.meeting.id : undefined,
    { empty: parsed.empty }
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
