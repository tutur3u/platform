import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultFormStudioInput } from '../../../../../../../apps/forms/src/features/forms/schema';
import { getMeetCallAccess } from '../../lib/call-access';
import {
  downloadExtendedFormResponseFile,
  readExtendedFormPublication,
} from './operations';
import { createExtendedFormsStore } from './store';

const ports = vi.hoisted(() => ({
  access: vi.fn(),
  room: vi.fn(),
  read: vi.fn<(table: string) => Record<string, unknown>[]>(),
  download: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/call-access', () => ({
  getMeetCallAccess: ports.access,
  MeetCallAccessError: class extends Error {},
}));
vi.mock('../room-service', () => ({ callRoomService: ports.room }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    rpc: async () => ({ data: true, error: null }),
    schema: () => ({
      from: (table: string) => ({ select: () => selectFixtureRows(table) }),
    }),
    storage: { from: () => ({ download: ports.download }) },
  }),
}));

// The fixture only returns rows that satisfy the real adapter's filters.
function selectFixtureRows(table: string) {
  let rows = ports.read(table);
  const query = {
    eq(field: string, value: unknown) {
      rows = rows.filter((row) => row[field] === value);
      return query;
    },
    filter(field: string, operator: 'eq', value: unknown) {
      expect(operator).toBe('eq');
      return query.eq(field, value);
    },
    contains(field: string, values: Record<string, unknown>) {
      rows = rows.filter((row) => {
        const metadata = row[field];
        if (!metadata || typeof metadata !== 'object') return false;
        return Object.entries(values).every(
          ([key, value]) => Reflect.get(metadata, key) === value
        );
      });
      return query;
    },
    not(field: string, _operator: 'is', value: null) {
      rows = rows.filter((row) => row[field] !== value);
      return query;
    },
    is(field: string, value: null) {
      rows = rows.filter((row) => row[field] === value);
      return query;
    },
    async maybeSingle() {
      if (rows.length > 1)
        throw new Error('Fixture returned more than one row');
      return { data: rows[0] ?? null, error: null };
    },
  };
  return query;
}

const id = (n: number) =>
  `81000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actorScope = '3'.repeat(64);
const workspaceA = { wsId: id(1), meetingId: id(2) };
const workspaceB = { wsId: id(3), meetingId: id(4) };
const formA = { id: id(5), wsId: workspaceA.wsId };
const formB = { id: id(6), wsId: workspaceB.wsId };
const launchA = {
  launchId: id(7),
  versionId: id(8),
  formId: formA.id,
  form: formA,
  roomId: `${workspaceA.wsId}:${workspaceA.meetingId}`,
};
const responseA = id(9);
const responseB = id(10);
const wrongLaunchResponse = id(11);
const staleVersionResponse = id(12);
const questionId = id(13);
const uploadA = id(14);
const uploadB = id(15);

function metadata(launchId = launchA.launchId, versionId = launchA.versionId) {
  return {
    meetRoomId: workspaceA.meetingId,
    meetLaunchId: launchId,
    meetVersionId: versionId,
    meetUploadActorScope: actorScope,
  };
}

function tables() {
  const draft = createDefaultFormStudioInput();
  const [section] = draft.sections;
  return {
    forms: [
      {
        id: formA.id,
        ws_id: formA.wsId,
        access_mode: 'anonymous',
        status: 'published',
        open_at: null,
        close_at: null,
      },
    ],
    form_published_versions: [
      {
        id: launchA.versionId,
        form_id: formA.id,
        ws_id: formA.wsId,
        score_reveal: 'after_submit',
        answer_reveal: 'never',
        definition: {
          ...draft,
          ...formA,
          status: 'published',
          sections: [
            {
              ...section,
              id: id(16),
              questions: section.questions.map((question) => ({
                ...question,
                id: questionId,
                sectionId: id(16),
              })),
            },
          ],
        },
      },
    ],
    form_responses: [
      {
        id: responseA,
        session_id: responseA,
        form_id: formA.id,
        completion_state: 'submitted',
      },
      {
        id: responseB,
        session_id: responseB,
        form_id: formB.id,
        completion_state: 'submitted',
      },
      {
        id: wrongLaunchResponse,
        session_id: wrongLaunchResponse,
        form_id: formA.id,
        completion_state: 'submitted',
      },
      {
        id: staleVersionResponse,
        session_id: staleVersionResponse,
        form_id: formA.id,
        completion_state: 'submitted',
      },
    ],
    form_sessions: [
      {
        id: responseA,
        form_id: formA.id,
        metadata: metadata(),
        submitted_at: '2026-11-19',
      },
      {
        id: responseB,
        form_id: formB.id,
        metadata: { ...metadata(), meetRoomId: workspaceB.meetingId },
        submitted_at: '2026-11-19',
      },
      {
        id: wrongLaunchResponse,
        form_id: formA.id,
        metadata: metadata(id(17)),
        submitted_at: '2026-11-19',
      },
      {
        id: staleVersionResponse,
        form_id: formA.id,
        metadata: metadata(launchA.launchId, id(18)),
        submitted_at: '2026-11-19',
      },
    ],
    form_respondent_uploads: [
      {
        id: uploadA,
        ws_id: formA.wsId,
        meeting_id: workspaceA.meetingId,
        form_id: formA.id,
        version_id: launchA.versionId,
        launch_id: launchA.launchId,
        question_id: questionId,
        actor_scope: actorScope,
        claimed_response_id: responseA,
        ready_at: '2026-11-19',
        cleanup_started_at: null,
        content_type: 'application/pdf',
        size_bytes: 3,
      },
      {
        id: uploadB,
        ws_id: formB.wsId,
        meeting_id: workspaceB.meetingId,
        form_id: formB.id,
        version_id: id(19),
        launch_id: id(20),
        question_id: id(21),
        actor_scope: actorScope,
        claimed_response_id: responseB,
        ready_at: '2026-11-19',
        cleanup_started_at: null,
        content_type: 'application/pdf',
        size_bytes: 3,
      },
    ],
    form_response_answers: [
      {
        response_id: responseA,
        question_id: questionId,
        question_type: 'file_upload',
        answer_json: [uploadA],
      },
    ],
  } satisfies Record<string, Record<string, unknown>[]>;
}

async function workspaceAStore() {
  return createExtendedFormsStore(
    await getMeetCallAccess(workspaceA.meetingId, 'Participant')
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  const fixture: Record<string, Record<string, unknown>[]> = tables();
  ports.read.mockImplementation((table) => fixture[table] ?? []);
  ports.access.mockResolvedValue({
    meeting: { id: workspaceA.meetingId, ws_id: workspaceA.wsId },
    user: { id: id(22) },
    isHost: true,
    canReadWorkspace: true,
  });
  ports.room.mockResolvedValue(launchA);
  ports.download.mockResolvedValue({ data: new Blob(['abc']), error: null });
});

describe('W4 form response and upload isolation', () => {
  it('allows the exact submitted response and answer-linked upload', async () => {
    const store = await workspaceAStore();
    expect(
      await readExtendedFormPublication(workspaceA, launchA.launchId, store, {
        responseId: responseA,
        resolveActorScope: () => actorScope,
      })
    ).toMatchObject({
      publication: { quizReveal: { score: true, answers: false } },
    });
    expect(
      await downloadExtendedFormResponseFile(
        workspaceA,
        {
          launchId: launchA.launchId,
          responseId: responseA,
          uploadId: uploadA,
        },
        store
      )
    ).toMatchObject({ status: 'ok' });
    expect(ports.download).toHaveBeenCalledOnce();
  });

  it.each([responseB, wrongLaunchResponse, staleVersionResponse])(
    'refuses foreign, wrong-launch, and stale-version responses %s',
    async (responseId) => {
      const store = await workspaceAStore();
      expect(
        await readExtendedFormPublication(workspaceA, launchA.launchId, store, {
          responseId,
          resolveActorScope: () => actorScope,
        })
      ).toMatchObject({
        publication: { quizReveal: { score: false, answers: false } },
      });
      expect(
        await downloadExtendedFormResponseFile(
          workspaceA,
          { launchId: launchA.launchId, responseId, uploadId: uploadB },
          store
        )
      ).toEqual({ status: 'not_found' });
      expect(ports.read).not.toHaveBeenCalledWith('form_respondent_uploads');
      expect(ports.download).not.toHaveBeenCalled();
    }
  );

  it('refuses a foreign upload even when the caller supplies a valid local response', async () => {
    expect(
      await downloadExtendedFormResponseFile(
        workspaceA,
        {
          launchId: launchA.launchId,
          responseId: responseA,
          uploadId: uploadB,
        },
        await workspaceAStore()
      )
    ).toEqual({ status: 'not_found' });
    expect(ports.read).toHaveBeenCalledWith('form_respondent_uploads');
    expect(ports.read).not.toHaveBeenCalledWith('form_response_answers');
    expect(ports.download).not.toHaveBeenCalled();
  });
});
