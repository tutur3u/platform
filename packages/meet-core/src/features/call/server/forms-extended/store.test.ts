import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMeetCallAccess } from '../../lib/call-access';
import { releaseExtendedFormQuiz } from './operations';
import { deriveExtendedFormRespondentScope } from './respondent-scope';
import { createExtendedFormsStore } from './store';

const ports = vi.hoisted(() => ({
  access: vi.fn(),
  room: vi.fn(),
  permission: vi.fn(),
  publication: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/call-access', () => ({
  getMeetCallAccess: ports.access,
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('../room-service', () => ({ callRoomService: ports.room }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    rpc: ports.permission,
    schema: () => ({
      from: () => ({
        select: () => {
          const query = { eq: () => query, maybeSingle: ports.publication };
          return query;
        },
        upsert: ports.upsert,
      }),
    }),
  }),
}));

const id = (value: number) =>
  `21580000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const context = { meetingId: id(1), wsId: id(2) };
const formId = id(3);
const versionId = id(4);
const launchId = id(5);
const actorId = id(6);

beforeEach(() => {
  vi.resetAllMocks();
  ports.access.mockResolvedValue({
    meeting: { id: context.meetingId, ws_id: context.wsId },
    user: { id: actorId },
    isHost: true,
    canReadWorkspace: true,
  });
  ports.room.mockResolvedValue({
    roomId: `${context.wsId}:${context.meetingId}`,
    launchId,
    versionId,
    formId,
    form: { id: formId, wsId: context.wsId },
    released_by: id(9),
  });
  ports.permission.mockResolvedValue({ data: true, error: null });
  ports.publication.mockResolvedValue({
    data: {
      id: versionId,
      form_id: formId,
      ws_id: context.wsId,
      score_reveal: 'manual',
      answer_reveal: 'never',
    },
    error: null,
  });
  ports.upsert.mockResolvedValue({ error: null });
});

describe('W4 release attribution', () => {
  it('writes the authorized host actor and preserves the first release on retries', async () => {
    const store = await createExtendedFormsStore(
      await getMeetCallAccess(context.meetingId, 'Participant')
    );

    await expect(
      releaseExtendedFormQuiz(context, launchId, store)
    ).resolves.toEqual({
      status: 'released',
      score: true,
      answers: false,
    });
    expect(ports.permission).toHaveBeenCalledWith('has_workspace_permission', {
      p_permission: 'manage_forms',
      p_user_id: actorId,
      p_ws_id: context.wsId,
    });
    expect(ports.upsert).toHaveBeenCalledExactlyOnceWith(
      {
        ws_id: context.wsId,
        form_id: formId,
        version_id: versionId,
        launch_id: launchId,
        released_by: actorId,
      },
      { onConflict: 'version_id,launch_id', ignoreDuplicates: true }
    );
  });

  it('consults no room state and attributes no release when form authority is denied', async () => {
    ports.permission.mockResolvedValue({ data: false, error: null });
    const store = await createExtendedFormsStore(
      await getMeetCallAccess(context.meetingId, 'Participant')
    );

    await expect(
      releaseExtendedFormQuiz(context, launchId, store)
    ).rejects.toThrow('Forms permission required');
    expect(ports.room).not.toHaveBeenCalled();
    expect(ports.upsert).not.toHaveBeenCalled();
  });
});

describe('W4 respondent scope', () => {
  it('uses the same digest for reservations, submitted session metadata and reveal', () => {
    vi.stubEnv('MEET_REALTIME_TOKEN_SECRET', 'test-only');
    try {
      const trusted = { wsId: context.wsId, formId, actorId };
      const upload = {
        actor_scope: deriveExtendedFormRespondentScope(trusted),
      };
      const submit = {
        meetUploadActorScope: deriveExtendedFormRespondentScope(trusted),
      };
      const reveal = deriveExtendedFormRespondentScope(trusted);

      expect(reveal).toMatch(/^[0-9a-f]{64}$/);
      expect(upload.actor_scope).toBe(reveal);
      expect(submit.meetUploadActorScope).toBe(reveal);
      expect(
        deriveExtendedFormRespondentScope({ ...trusted, wsId: id(7) })
      ).not.toBe(reveal);
      expect(
        deriveExtendedFormRespondentScope({ ...trusted, formId: id(8) })
      ).not.toBe(reveal);
      expect(
        deriveExtendedFormRespondentScope({ ...trusted, actorId: id(9) })
      ).not.toBe(reveal);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
