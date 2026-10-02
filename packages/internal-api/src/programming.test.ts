import { describe, expect, it, vi } from 'vitest';
import {
  getProgrammingAuthorProblem,
  getProgrammingProblem,
  listProgrammingProblems,
  programmingQueryKey,
} from './programming';

describe('Programming web facade', () => {
  it('forwards selected learner and auth to the explicitly configured web origin', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ problem: {} }), { status: 200 })
      );
    await getProgrammingProblem('workspace/a', 'problem/a', 'student-a', {
      baseUrl: 'https://synthetic.invalid',
      defaultHeaders: { Authorization: 'Bearer synthetic' },
      fetch,
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(
      'https://synthetic.invalid/api/v1/workspaces/workspace%2Fa/programming/problems/problem%2Fa?mode=learner&studentId=student-a'
    );
    expect(init.cache).toBe('no-store');
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer synthetic'
    );
  });
  it('keeps browser calls same-origin unless a base URL is explicitly supplied', async () => {
    vi.stubGlobal('window', {});
    try {
      const fetch = vi
        .fn()
        .mockResolvedValue(Response.json({ problems: [], nextCursor: null }));
      await listProgrammingProblems('workspace', {}, { fetch });
      expect(fetch.mock.calls[0]?.[0]).toBe(
        '/api/v1/workspaces/workspace/programming/problems'
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('uses explicit author shape without a learner selection', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ problem: {} }), { status: 200 })
      );
    await getProgrammingAuthorProblem('workspace', 'problem', {
      baseUrl: 'https://synthetic.invalid',
      fetch,
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://synthetic.invalid/api/v1/workspaces/workspace/programming/problems/problem?mode=author'
    );
  });
  it('does not turn storage failure into empty catalog', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Synthetic error' }), {
        status: 500,
      })
    );
    await expect(
      listProgrammingProblems(
        'workspace',
        {},
        { baseUrl: 'https://synthetic.invalid', fetch }
      )
    ).rejects.toMatchObject({ status: 500 });
  });
  it('isolates author and learner responses and actor/workspace/learner scope', () => {
    const base = {
      actorId: 'actor',
      wsId: 'workspace',
      mode: 'learner' as const,
    };
    for (const change of [
      { mode: 'author' as const },
      { actorId: 'other' },
      { wsId: 'other' },
      { studentId: 'other' },
      { problemId: 'other' },
    ]) {
      expect(programmingQueryKey({ ...base, ...change })).not.toEqual(
        programmingQueryKey(base)
      );
    }
  });
});
