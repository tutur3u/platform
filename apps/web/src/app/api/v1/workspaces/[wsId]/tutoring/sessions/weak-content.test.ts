// @vitest-environment node
import {
  STANDARD_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
} from '@tuturuuu/internal-api/tutoring-policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const sessionId = 'f0747f37-bf6d-4263-a5df-a11c57bdc762';
const feedbackId = '0b6f1c3a-6a4e-4a43-9d7a-0d9a4d8f3c11';
const ids = {
  groupId: '7c1f1e0e-4a2b-4d57-b0d4-1c0c5f2a9a01',
  studentUserId: '9a2f5b7e-3d10-4f64-8a5e-6c7d8e9f0a02',
};

const state = vi.hoisted(() => ({
  canManageClasses: false,
  current: {
    reason_type: 'ABSENT_RECOVERY',
    source_feedback_id: null as string | null,
  },
  restrict: true,
}));

function fakeAdmin() {
  const rows = serializeTutoringPolicyConfigRows({
    ...STANDARD_TUTORING_POLICY,
    restrictWeakContentEditors: state.restrict,
  });
  let updating = false;
  const builder = {
    eq: () => builder,
    like: async () => ({ data: rows, error: null }),
    maybeSingle: async () => ({
      data: updating
        ? { id: sessionId }
        : {
            id: sessionId,
            group_id: null,
            session_date: '2026-11-02',
            start_time: '09:00',
            duration_minutes: 45,
            teacher_user_id: null,
            student_user_id: ids.studentUserId,
            ...state.current,
          },
      error: null,
    }),
    select: () => builder,
    update: () => {
      updating = true;
      return builder;
    },
  };
  return { from: () => builder, schema: () => ({ from: () => builder }) };
}

vi.mock('next/server', () => ({
  connection: async () => {},
  NextResponse: { json: Response.json },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => fakeAdmin(),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({ user: { id: 'actor' } }),
}));
vi.mock('@/lib/tutoring/route-access', () => ({
  createTutoringRequestClient: async () => ({}),
  resolveTutoringRouteAccess: async () => ({
    normalizedWsId: wsId,
    permissions: {
      withoutPermission: (permission: string) =>
        permission === 'update_user_groups' ? !state.canManageClasses : false,
    },
    user: { id: 'actor' },
  }),
}));
// Reaching the scope check means the weak-content check let the request through.
vi.mock(
  '@/legacy-api-routes/v1/workspaces/[wsId]/tutoring/sessions/session-create-helpers',
  () => ({
    buildTutoringSessionSlots: () => [],
    getAdjacentSessionDates: () => [],
    listPotentialSchedulingConflicts: async () => ({ data: [], error: null }),
    validateTutoringSessionScope: async () =>
      Response.json({ message: 'past-weak-content-check' }, { status: 422 }),
  })
);
vi.mock('@/lib/tutoring/completion-notification', () => ({
  notifyCompletionSafely: async () => {},
}));
vi.mock('@/lib/tutoring/linked-content', () => ({
  freezeLinkedLessonContent: async () => 'skipped',
  isLinkedContentSession: () => false,
  LINKED_CONTENT_NOT_STORED: 'LINKED_CONTENT_NOT_STORED',
  loadLinkedLessonContent: async () => new Map(),
}));

async function create(body: Record<string, unknown>) {
  const { POST } = await import('./route');
  return POST(
    new Request('http://localhost/tutoring/sessions', {
      body: JSON.stringify({
        ...ids,
        sessionDate: '2026-11-02',
        startTime: '09:00',
        ...body,
      }),
      method: 'POST',
    }),
    { params: Promise.resolve({ wsId }) }
  );
}

async function update(body: Record<string, unknown>) {
  const { PUT } = await import('./[id]/route');
  return PUT(
    new Request(`http://localhost/tutoring/sessions/${sessionId}`, {
      body: JSON.stringify(body),
      method: 'PUT',
    }),
    { params: Promise.resolve({ id: sessionId, wsId }) }
  );
}

async function expectRestricted(response: Response) {
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({
    code: 'TUTORING_CONTENT_RESTRICTED',
  });
}

beforeEach(() => {
  state.canManageClasses = false;
  state.current = { reason_type: 'ABSENT_RECOVERY', source_feedback_id: null };
  state.restrict = true;
});

describe('POST /tutoring/sessions weak-support content', () => {
  it('denies a weak-support session to editors outside class management', async () => {
    await expectRestricted(
      await create({ reasonType: 'WEAK_SUPPORT', content: 'plan' })
    );
  });

  it('denies a session created from a require_attention feedback', async () => {
    await expectRestricted(
      await create({
        reasonType: 'ABSENT_RECOVERY',
        sourceFeedbackId: feedbackId,
      })
    );
  });

  it('leaves absence recovery content unaffected', async () => {
    expect((await create({ reasonType: 'ABSENT_RECOVERY' })).status).toBe(422);
  });

  it('lets class managers create weak-support sessions', async () => {
    state.canManageClasses = true;

    expect((await create({ reasonType: 'WEAK_SUPPORT' })).status).toBe(422);
  });

  it('lets anyone create them while the restriction is off', async () => {
    state.restrict = false;

    expect((await create({ reasonType: 'WEAK_SUPPORT' })).status).toBe(422);
  });
});

describe('PUT /tutoring/sessions/{id} weak-support content', () => {
  beforeEach(() => {
    state.current = { reason_type: 'WEAK_SUPPORT', source_feedback_id: null };
  });

  it.each([{ content: 'new notes' }, { reasonDetail: 'new reason' }])(
    'denies %j on a weak-support session',
    async (body) => {
      await expectRestricted(await update(body));
    }
  );

  it('denies content on a session sourced from a feedback', async () => {
    state.current = {
      reason_type: 'ABSENT_RECOVERY',
      source_feedback_id: feedbackId,
    };

    await expectRestricted(await update({ content: 'new notes' }));
  });

  it('denies turning a session into weak support while editing its text', async () => {
    state.current = {
      reason_type: 'ABSENT_RECOVERY',
      source_feedback_id: null,
    };

    await expectRestricted(
      await update({ content: 'notes', reasonType: 'WEAK_SUPPORT' })
    );
  });

  it('denies moving weak content out of weak support', async () => {
    await expectRestricted(await update({ reasonType: 'CUSTOM' }));
  });

  it('does not restrict attendance changes on a weak-support session', async () => {
    expect((await update({ attendanceStatus: 'CANCELLED' })).status).toBe(200);
  });

  it('leaves absence recovery content unaffected', async () => {
    state.current = {
      reason_type: 'ABSENT_RECOVERY',
      source_feedback_id: null,
    };

    expect(
      (await update({ content: 'notes', reasonDetail: 'why' })).status
    ).toBe(200);
  });

  it('lets class managers edit weak-support content', async () => {
    state.canManageClasses = true;

    expect((await update({ content: 'new notes' })).status).toBe(200);
  });

  it('lets anyone edit it while the restriction is off', async () => {
    state.restrict = false;

    expect((await update({ content: 'new notes' })).status).toBe(200);
  });
});
