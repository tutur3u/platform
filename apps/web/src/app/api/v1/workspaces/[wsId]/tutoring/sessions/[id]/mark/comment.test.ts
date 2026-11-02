// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import {
  TutoringMarkSchema,
  TutoringSessionUpdateSchema,
} from '@/legacy-api-routes/v1/workspaces/[wsId]/tutoring/shared';

const state = vi.hoisted(() => ({
  enabled: false,
  allowed: true,
  owner: true,
}));
const query = vi.hoisted(() => {
  const q = {
    eq: vi.fn(() => q),
    select: vi.fn(() => q),
    update: vi.fn(() => q),
    maybeSingle: vi.fn(async () => ({ data: { id: 'session' }, error: null })),
  };
  return q;
});
vi.mock('next/server', () => ({ NextResponse: { json: Response.json } }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ schema: () => ({ from: () => query }) }),
}));
vi.mock('@/lib/tutoring/route-access', () => ({
  resolveTutoringRouteAccess: async () => ({
    normalizedWsId: 'workspace',
    user: null,
    permissions: { withoutPermission: () => !state.allowed },
  }),
}));
vi.mock('@/lib/tutoring/read-scope', () => ({
  resolveTutoringWriteScope: async () => ({
    allowed: state.owner,
    teacherId: 'teacher',
  }),
}));
vi.mock('@/lib/tutoring/tutor-comments', () => ({
  tutorCommentsEnabled: async () => state.enabled,
}));
vi.mock('@/lib/tutoring/linked-content', () => ({
  freezeLinkedLessonContent: async () => 'skipped',
}));
vi.mock('@/lib/tutoring/completion-notification', () => ({
  notifyCompletionSafely: async () => {},
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.enabled = false;
  state.allowed = true;
  state.owner = true;
});
async function mark(tutorComment?: unknown) {
  const { POST } = await import('./route');
  return POST(
    new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ attendanceStatus: 'DONE', tutorComment }),
    }),
    { params: Promise.resolve({ wsId: 'workspace', id: 'session' }) }
  );
}
it('flag OFF preserves the existing mark update', async () => {
  expect((await mark()).status).toBe(200);
  expect(query.update).toHaveBeenCalledWith({
    attendance_status: 'DONE',
    resolved_at: expect.any(String),
  });
});
it('flag OFF refuses comment writes', async () => {
  expect((await mark('note')).status).toBe(404);
  expect(query.update).not.toHaveBeenCalled();
});
it('flag ON captures a trimmed comment', async () => {
  state.enabled = true;
  expect((await mark('  progress  ')).status).toBe(200);
  expect(query.update).toHaveBeenCalledWith(
    expect.objectContaining({ tutor_comment: 'progress' })
  );
});
it('requires marking permission', async () => {
  state.enabled = true;
  state.allowed = false;
  expect((await mark('note')).status).toBe(403);
  expect(query.update).not.toHaveBeenCalled();
});
it('requires the existing teacher write scope', async () => {
  state.enabled = true;
  state.owner = false;
  expect((await mark('note')).status).toBe(403);
  expect(query.update).not.toHaveBeenCalled();
});
for (const schema of [TutoringMarkSchema, TutoringSessionUpdateSchema]) {
  it.each([
    ['  note  ', 'note'],
    ['', null],
    ['  ', null],
    ['x'.repeat(2000), 'x'.repeat(2000)],
  ])('normalizes comment %s', (input, expected) => {
    expect(
      schema.parse({ attendanceStatus: 'DONE', tutorComment: input })
    ).toHaveProperty('tutorComment', expected);
  });
  it.each(['x'.repeat(2001), 12, null])(
    'rejects invalid comment',
    (tutorComment) => {
      expect(
        schema.safeParse({ attendanceStatus: 'DONE', tutorComment }).success
      ).toBe(false);
    }
  );
}
