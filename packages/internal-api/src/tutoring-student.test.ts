import { expect, it, vi } from 'vitest';
import { getTutoringStudentView } from './tutoring';

function fixture({
  enabled = true,
  commentsEnabled = false,
  denied = false,
  commentDenied = false,
} = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = new URL(String(input));
    if (denied) return Response.json({}, { status: 403 });
    if (url.pathname.endsWith('/comment') && commentDenied)
      return Response.json({}, { status: 403 });
    if (url.pathname.endsWith('/comment'))
      return Response.json({ tutorComment: 'Progress' });
    if (url.pathname.endsWith('/attendance'))
      return Response.json({
        attendance: [
          { status: 'ABSENT', groups: { id: 'current' } },
          { status: 'ABSENT', groups: { id: 'former' } },
          { status: 'PRESENT', groups: { id: 'current' } },
        ],
      });
    const page = Number(url.searchParams.get('page'));
    return Response.json({
      data: [
        {
          id: String(page),
          student_user_id: 'learner',
          attendance_status: page === 1 ? 'NO_SHOW' : 'DONE',
        },
      ],
      totalPages: 2,
    });
  });
  const run = () =>
    getTutoringStudentView(
      'workspace',
      {
        enabled,
        commentsEnabled,
        studentUserId: 'learner',
        month: '2026-11',
        currentGroupIds: ['current'],
      },
      { baseUrl: 'https://fixture.test', fetch }
    );
  return { run, fetch };
}
it('flag OFF leaves existing behavior unchanged and makes no requests', async () => {
  const { run, fetch } = fixture({ enabled: false });
  expect(await run()).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it('B7 ON, B6 OFF loads every session page without comments', async () => {
  const { run, fetch } = fixture();
  const result = await run();
  expect(result?.sessions).toHaveLength(2);
  expect(result?.sessions.every((s) => s.tutor_comment === null)).toBe(true);
  expect(
    fetch.mock.calls.some(([url]) => String(url).endsWith('/comment'))
  ).toBe(false);
});
it('both flags ON uses the staff-authorized B6 comment endpoint', async () => {
  expect(
    (await fixture({ commentsEnabled: true }).run())?.sessions[0]?.tutor_comment
  ).toBe('Progress');
});
it('counts tutoring no-shows separately from current-class absences', async () => {
  expect(await fixture().run()).toMatchObject({ noShows: 1, classAbsences: 1 });
});
it.each(['student', 'parent'])(
  'preserves API permission denial for a %s',
  async () => {
    const { run, fetch } = fixture({ denied: true });
    await expect(run()).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toContain('studentUserId=learner');
  }
);
it('scopes all session pages to the requested learner and month', async () => {
  const { run, fetch } = fixture();
  await run();
  const urls = fetch.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname.endsWith('/sessions'));
  expect(urls).toHaveLength(2);
  for (const url of urls) {
    expect(url.searchParams.get('studentUserId')).toBe('learner');
    expect(url.searchParams.get('fromDate')).toBe('2026-11-01');
    expect(url.searchParams.get('toDate')).toBe('2026-11-30');
  }
});

it('both flags ON still hides comments denied by B6 staff authorization', async () => {
  const result = await fixture({
    commentsEnabled: true,
    commentDenied: true,
  }).run();
  expect(result?.sessions).toHaveLength(2);
  expect(
    result?.sessions.every((session) => session.tutor_comment === null)
  ).toBe(true);
});
