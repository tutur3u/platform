import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  room: vi.fn(),
  rpc: vi.fn(),
  read: vi.fn(),
  user: vi.fn(),
  from: vi.fn(),
  receipt: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('../room-service', () => ({ callRoomService: mocks.room }));
vi.mock('../../lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      readonly status: number,
      message: string,
      readonly code?: string
    ) {
      super(message);
    }
  },
}));
vi.mock('./forms-source', async () => {
  const schema =
    await import('../../../../../../../apps/forms/src/features/forms/schema');
  const content =
    await import('../../../../../../../apps/forms/src/features/forms/content');
  const validation =
    await import('../../../../../../../apps/forms/src/features/forms/validation');
  const media =
    await import('../../../../../../../apps/forms/src/features/forms/server/media');
  const answers =
    await import('../../../../../../../apps/forms/src/features/forms/server/answers');
  const branching =
    await import('../../../../../../../apps/forms/src/features/forms/branching');
  return {
    ...schema,
    ...content,
    ...validation,
    ...media,
    ...answers,
    ...branching,
    resolveFormDefinitionMedia: (_db: unknown, form: unknown) => form,
  };
});

import { TurnstileError } from '@tuturuuu/cloudflare/turnstile/server';
import { createDefaultFormStudioInput } from './forms-source';
import {
  getParticipantLaunch,
  launchActionSchema,
  listLaunchableForms,
  runFormLaunchAction,
} from './launches';
import type { FormAccess } from './policy';
import { getFormPrefill, prefillRequestSchema } from './prefill';
import { meetFormAnswerId, meetFormResponseIdentity } from './response-ids';
import { formChallenge, verifyFormSubmissionGate } from './submission-proof';
import { submitMeetForm } from './submit';

function id(value: number) {
  return `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

const wsId = id(1);
const formId = id(2);
const launchId = id(3);
const versionId = id(4);
const sectionId = id(5);
const nameId = id(6);
const emailId = id(7);
const userId = id(8);
const now = '2026-11-18T12:00:00.000Z';
const access = {
  user: { id: userId },
  meeting: { id: id(9), ws_id: wsId },
  suggestedDisplayName: 'Guest Name',
  canReadWorkspace: false,
  isHost: false,
} as FormAccess;
const reference = { formId, versionId };

const base = createDefaultFormStudioInput();
const section = base.sections[0]!;
const question = section.questions[0]!;
const launch = {
  launchId,
  formId,
  versionId,
  form: {
    ...base,
    id: formId,
    wsId,
    creatorId: userId,
    createdAt: now,
    updatedAt: now,
    status: 'published',
    sections: [
      {
        ...section,
        id: sectionId,
        questions: [
          { ...question, id: nameId, sectionId, title: 'Full name' },
          {
            ...question,
            id: emailId,
            sectionId,
            title: 'Email',
            type: 'email',
          },
        ],
      },
    ],
  },
};

const db = {
  rpc: mocks.rpc,
  from: mocks.from,
  schema: () => ({
    from: (table: string) => {
      if (table === 'form_sessions') {
        const query = {
          eq: () => query,
          contains: () => query,
          not: () => query,
          maybeSingle: mocks.receipt,
        };
        return { select: () => query };
      }
      if (table !== 'forms')
        throw new Error(`Unexpected direct access to ${table}`);
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: mocks.read }) }),
        }),
      };
    },
  }),
  auth: { admin: { getUserById: mocks.user } },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue(db);
  mocks.receipt.mockResolvedValue({ data: null, error: null });
  mocks.room.mockResolvedValue(launch);
  mocks.read.mockResolvedValue({
    data: {
      id: formId,
      updated_at: now,
      status: 'published',
      access_mode: 'anonymous',
      settings: { requireTurnstile: false },
    },
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Meet Forms permissions and private prefill', () => {
  it('requires meeting host and Forms permission before querying the catalog', async () => {
    await expect(listLaunchableForms(access)).rejects.toMatchObject({
      status: 403,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(
      listLaunchableForms({
        ...access,
        canReadWorkspace: true,
        isHost: true,
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.rpc).toHaveBeenCalledWith('has_workspace_permission', {
      p_permission: 'manage_forms',
      p_user_id: userId,
      p_ws_id: wsId,
    });
    expect(mocks.room).not.toHaveBeenCalled();
  });

  it('rejects a foreign workspace or mismatched launch version before reading Forms', async () => {
    mocks.room.mockResolvedValue({
      ...launch,
      form: { ...launch.form, wsId: id(90) },
    });
    await expect(
      getFormPrefill(access, launchId, {
        ...reference,
        consent: true,
        questionIds: [nameId],
      })
    ).rejects.toMatchObject({ status: 404 });
    mocks.room.mockResolvedValue(launch);
    await expect(
      getFormPrefill(access, launchId, {
        ...reference,
        versionId: id(91),
        consent: true,
        questionIds: [nameId],
      })
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('returns no identity prefill to members on anonymous launches', async () => {
    await expect(
      getFormPrefill({ ...access, canReadWorkspace: true }, launchId, {
        ...reference,
        consent: true,
        meetDisplayName: 'Explicit room name',
        questionIds: [nameId, emailId],
      })
    ).resolves.toEqual({ answers: {} });
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('prefills requested identity fields only for consenting verified members', async () => {
    mocks.room.mockResolvedValue({
      ...launch,
      form: { ...launch.form, accessMode: 'authenticated' },
    });
    mocks.read.mockResolvedValue({
      data: { status: 'published', access_mode: 'authenticated' },
      error: null,
    });
    mocks.user.mockResolvedValue({
      data: {
        user: {
          id: userId,
          is_anonymous: false,
          email: 'member@example.test',
          email_confirmed_at: now,
        },
      },
      error: null,
    });
    const input = { ...reference, questionIds: [emailId] };
    const member = { ...access, canReadWorkspace: true };
    await expect(
      getFormPrefill(access, launchId, {
        ...input,
        consent: true,
        questionIds: [nameId, emailId],
      })
    ).resolves.toEqual({ answers: {} });
    await expect(
      getFormPrefill(member, launchId, {
        ...input,
        consent: false,
      })
    ).resolves.toEqual({ answers: {} });
    await expect(
      getFormPrefill(member, launchId, {
        ...input,
        consent: true,
      })
    ).resolves.toEqual({ answers: { [emailId]: 'member@example.test' } });
  });

  it('prefills only an explicitly supplied Meet name for an admitted guest', async () => {
    mocks.room.mockResolvedValue({
      ...launch,
      form: { ...launch.form, accessMode: 'authenticated_email' },
    });
    mocks.read.mockResolvedValue({
      data: { status: 'published', access_mode: 'authenticated_email' },
      error: null,
    });
    mocks.user.mockResolvedValue({
      data: {
        user: {
          id: userId,
          is_anonymous: false,
          email: 'guest@example.test',
          email_confirmed_at: now,
        },
      },
      error: null,
    });
    const explicitName = {
      ...reference,
      meetDisplayName: '  Room Alias  ',
      questionIds: [nameId, emailId],
    };
    await expect(
      getFormPrefill(
        access,
        launchId,
        prefillRequestSchema.parse({
          ...explicitName,
          consent: true,
        })
      )
    ).resolves.toEqual({ answers: { [nameId]: 'Room Alias' } });
    await expect(
      getFormPrefill(
        access,
        launchId,
        prefillRequestSchema.parse({
          ...explicitName,
          consent: false,
        })
      )
    ).resolves.toEqual({ answers: {} });
    await expect(
      getFormPrefill(
        access,
        launchId,
        prefillRequestSchema.parse({
          ...explicitName,
          consent: true,
          questionIds: [emailId],
        })
      )
    ).resolves.toEqual({ answers: {} });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('denies anonymous guests on account-only forms', async () => {
    mocks.room.mockResolvedValue({
      ...launch,
      form: { ...launch.form, accessMode: 'authenticated' },
    });
    mocks.read.mockResolvedValue({
      data: { status: 'published', access_mode: 'authenticated' },
      error: null,
    });
    mocks.user.mockResolvedValue({
      data: { user: { id: userId, is_anonymous: true } },
      error: null,
    });
    await expect(
      getFormPrefill(access, launchId, {
        ...reference,
        consent: true,
        questionIds: [nameId],
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('binds newly required Turnstile to the trusted deployment, action and policy revision', async () => {
    vi.stubEnv('MEET_FORMS_TURNSTILE_HOSTNAME', 'meet.example.test');
    mocks.room.mockResolvedValue({
      ...launch,
      form: {
        ...launch.form,
        settings: { ...base.settings, requireTurnstile: false },
      },
    });
    mocks.read.mockResolvedValue({
      data: {
        status: 'published',
        updated_at: now,
        access_mode: 'anonymous',
        settings: { requireTurnstile: true },
      },
      error: null,
    });
    const participant = await getParticipantLaunch(
      access,
      db as unknown as Parameters<typeof getParticipantLaunch>[1],
      launchId,
      reference
    );
    expect(participant.policy.requireTurnstile).toBe(true);
    const challenge = formChallenge(
      access.meeting,
      launch,
      participant.policyRevision
    );
    expect(challenge.cData).not.toBe(
      formChallenge(access.meeting, launch, 'new revision').cData
    );
    expect(challenge.cData).not.toBe(
      formChallenge(access.meeting, { ...launch, launchId: id(32) }, now).cData
    );
    const verify = vi
      .fn()
      .mockRejectedValue(new TurnstileError('verification_failed', 'Rejected'));
    const request = new Request('https://untrusted-host.example.test/form');
    await expect(
      verifyFormSubmissionGate(request, challenge, 'placeholder', verify)
    ).rejects.toMatchObject({ status: 400, code: 'TURNSTILE_REQUIRED' });
    expect(verify).toHaveBeenCalledWith(request, 'placeholder', {
      devMode: false,
      expectedHostname: 'meet.example.test',
      expectedAction: 'meet_form_submit',
      expectedCData: challenge.cData,
    });
    vi.stubEnv('MEET_FORMS_TURNSTILE_HOSTNAME', '');
    await expect(
      verifyFormSubmissionGate(request, challenge, 'placeholder', verify)
    ).rejects.toMatchObject({ status: 503 });
    expect(verify).toHaveBeenCalledTimes(1);
  });
});

it.each(['id', 'ws_id'] as const)(
  'rejects a successful Turnstile verification from another meeting scope %s',
  async (scopeField) => {
    vi.stubEnv('MEET_FORMS_TURNSTILE_HOSTNAME', 'meet.example.test');
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'fixture-secret');
    const issued = formChallenge(access.meeting, launch, now);
    const fetch = vi.fn(async () =>
      Response.json({
        success: true,
        hostname: 'meet.example.test',
        action: issued.action,
        cdata: issued.cData,
      })
    );
    vi.stubGlobal('fetch', fetch);
    const request = new Request('https://meet.example.test/form');

    await expect(
      verifyFormSubmissionGate(request, issued, 'fixture-token')
    ).resolves.toBe('verified');
    const changed = { ...access.meeting, [scopeField]: id(41) };
    const otherScope = formChallenge(changed, launch, now);
    await expect(
      verifyFormSubmissionGate(request, otherScope, 'fixture-token')
    ).rejects.toMatchObject({ status: 400, code: 'TURNSTILE_REQUIRED' });
    expect(fetch).toHaveBeenCalledTimes(2);
  }
);

it('honors Forms permission revoked between the application check and creation RPC', async () => {
  const host = { ...access, canReadWorkspace: true, isHost: true };
  mocks.rpc
    .mockResolvedValueOnce({ data: true, error: null })
    .mockResolvedValueOnce({ data: { kind: 'forbidden' }, error: null });
  const operation = launchActionSchema.parse({
    action: 'create',
    requestId: id(10),
    definition: base,
  });

  await expect(runFormLaunchAction(host, operation)).rejects.toMatchObject({
    status: 403,
  });
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
  expect(mocks.rpc).toHaveBeenNthCalledWith(
    2,
    'meet_form_creation',
    expect.objectContaining({ p_operation: 'reserve' })
  );
  expect(mocks.room).toHaveBeenCalledExactlyOnceWith(host, {
    action: 'forms.authorize',
  });
});

it.each(['database reply', 'room reply'])(
  'recovers inline creation after a lost %s',
  async (failure) => {
    const host = { ...access, canReadWorkspace: true, isHost: true };
    let stored: unknown;
    const roomLaunches: unknown[] = [];
    mocks.rpc.mockImplementation(async (rpc, args) => {
      if (rpc === 'has_workspace_permission')
        return { data: true, error: null };
      if (args.p_operation === 'reserve') {
        return {
          data: stored ?? {
            kind: 'reserved',
            createdAt: now,
            formId,
            launchId,
          },
          error: null,
        };
      }
      if (args.p_operation === 'finalize') {
        return {
          data: { ...(stored as object), kind: 'published' },
          error: null,
        };
      }
      stored = { kind: 'staged', launch: args.p_value };
      return failure === 'database reply'
        ? { data: null, error: { message: 'Lost database reply' } }
        : { data: stored, error: null };
    });
    mocks.room.mockImplementation(async (_access, command) => {
      if (command.action === 'forms.authorize') return { ok: true };
      roomLaunches.push(command.launch);
      if (failure === 'room reply' && roomLaunches.length === 1)
        throw new Error('Lost room reply');
      return command.launch;
    });
    const operation = launchActionSchema.parse({
      action: 'create',
      requestId: id(10),
      definition: base,
    });

    if (failure === 'database reply') {
      await expect(runFormLaunchAction(host, operation)).rejects.toMatchObject({
        status: 503,
        code: 'RETRY_FORM_CREATION',
      });
    } else {
      const failed = await runFormLaunchAction(host, operation);
      expect(failed).toBeInstanceOf(Response);
      if (!(failed instanceof Response))
        throw new Error('Expected retry details');
      expect(await failed.json()).toMatchObject({
        recovery: { requestId: id(10), formId, launchId },
      });
    }

    await expect(runFormLaunchAction(host, operation)).resolves.toMatchObject({
      formId,
      launchId,
    });
    expect(
      mocks.rpc.mock.calls
        .filter(([rpc]) => rpc === 'meet_form_creation')
        .map(([, args]) => args.p_operation)
    ).toEqual(['reserve', 'materialize', 'reserve', 'finalize']);
    expect(roomLaunches.at(-1)).toEqual(
      expect.objectContaining({ formId, launchId })
    );
    if (failure === 'room reply')
      expect(roomLaunches[0]).toEqual(roomLaunches[1]);
  }
);

it('submits the complete anonymous response and metadata in one RPC', async () => {
  mocks.room.mockResolvedValue({
    ...launch,
    form: {
      ...launch.form,
      settings: { ...base.settings, requireTurnstile: false },
      sections: [
        {
          ...launch.form.sections[0]!,
          questions: [launch.form.sections[0]!.questions[0]!],
        },
      ],
    },
  });
  const responseId = id(11);
  mocks.rpc.mockResolvedValue({
    data: {
      kind: 'submitted',
      response_id: responseId,
      replayed: false,
    },
    error: null,
  });
  const result = await submitMeetForm(
    access,
    launchId,
    {
      ...reference,
      submissionId: id(12),
      answers: { [nameId]: 'Sample' },
    },
    new Request('https://meet.example.test/form')
  );
  expect(result).toEqual({
    kind: 'submitted',
    launchId,
    formId,
    versionId,
    responseId,
  });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('commit_form_response', {
    p_submission: expect.objectContaining({
      proof: 'exempt',
      policy_revision: now,
      respondent_user_id: null,
      respondent_email: null,
      metadata: {
        meetRoomId: access.meeting.id,
        meetLaunchId: launchId,
        meetVersionId: versionId,
      },
      answers: [
        expect.objectContaining({ question_id: nameId, answer_text: 'Sample' }),
      ],
    }),
  });
});

it('binds finalized-session recovery to the submitted answers and launch', () => {
  const input = {
    meetingId: access.meeting.id,
    launchId,
    formId,
    versionId,
    actorId: userId,
    submissionId: id(10),
    answers: { [nameId]: 'Guest Name' },
  };
  const first = meetFormResponseIdentity(input);
  expect(meetFormResponseIdentity(input)).toEqual(first);
  expect(meetFormResponseIdentity({ ...input, answers: {} })).toMatchObject({
    sessionId: first.sessionId,
    sessionToken: expect.not.stringMatching(first.sessionToken),
  });
  expect(
    meetFormResponseIdentity({ ...input, launchId: id(11) }).sessionId
  ).not.toBe(first.sessionId);
});

it('matches the durable answer ID used by the deleted-question SQL result fixture', () => {
  const responseId = '33447a59-e00a-42e5-b6cf-15eedcbf7db3';
  expect(
    meetFormAnswerId(responseId, '33247a59-e00a-42e5-b6cf-15eedcbf7db3')
  ).toBe('73803e53-15b9-8c2b-ae56-d7c40660cc26');
  expect(
    meetFormAnswerId(responseId, 'fa28af95-848b-4100-8666-56d68f7bb230')
  ).toBe('173107c1-72e6-8d92-a191-3f3d6b7b814e');
});
