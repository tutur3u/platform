import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionAuthContext } from './api-auth';
import {
  authorizeProgrammingRequest,
  PROGRAMMING_SESSION_AUTH,
  programmingErrorResponse,
  programmingJson,
} from './programming-api';

const mocks = vi.hoisted(() => ({ author: vi.fn(), learner: vi.fn() }));
vi.mock('@tuturuuu/education-core/education/programming-access', () => ({
  checkProgrammingAuthorAccess: mocks.author,
  resolveProgrammingLearnerAccess: mocks.learner,
}));
const context = { user: { id: 'actor' }, supabase: {} } as SessionAuthContext;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.author.mockResolvedValue({ ok: true, normalizedWsId: 'normalized' });
  mocks.learner.mockResolvedValue({ wsId: 'normalized', readOnly: true });
});
describe('Programming API authorization modes', () => {
  it('requires manager authorization without requiring a linked learner', async () => {
    const access = await authorizeProgrammingRequest(
      context,
      'alias',
      'https://synthetic.invalid?mode=author'
    );
    expect(access).toEqual({
      wsId: 'normalized',
      actorId: 'actor',
      mode: 'author',
    });
    expect(mocks.author).toHaveBeenCalledWith({ context, wsId: 'alias' });
    expect(mocks.learner).not.toHaveBeenCalled();
  });
  it('preserves explicit learner selection for real subject resolution', async () => {
    const studentId = '11111111-1111-4111-8111-111111111111';
    await authorizeProgrammingRequest(
      context,
      'alias',
      `https://synthetic.invalid?studentId=${studentId}`
    );
    expect(mocks.learner).toHaveBeenCalledWith({
      context,
      wsId: 'alias',
      studentId,
    });
    expect(mocks.author).not.toHaveBeenCalled();
  });
  it('does not allow studentId to select a mutation actor', async () => {
    const response = await authorizeProgrammingRequest(
      context,
      'alias',
      'https://synthetic.invalid?studentId=11111111-1111-4111-8111-111111111111',
      true
    );
    expect(response).toBeInstanceOf(NextResponse);
    expect((response as NextResponse).status).toBe(400);
    expect(mocks.author).not.toHaveBeenCalled();
    expect(mocks.learner).not.toHaveBeenCalled();
  });
  it('preserves author permission and membership errors with private cache', async () => {
    for (const status of [403, 404, 500]) {
      mocks.author.mockResolvedValue({
        ok: false,
        response: NextResponse.json(
          { message: 'Synthetic denial' },
          { status }
        ),
      });
      const response = await authorizeProgrammingRequest(
        context,
        'alias',
        'https://synthetic.invalid?mode=author'
      );
      expect((response as NextResponse).status).toBe(status);
      expect((response as NextResponse).headers.get('cache-control')).toBe(
        'private, no-store'
      );
    }
  });
  it('rejects unknown modes and malformed selected learners before access', async () => {
    for (const query of ['mode=unknown', 'studentId=invalid']) {
      const response = await authorizeProgrammingRequest(
        context,
        'alias',
        `https://synthetic.invalid?${query}`
      );
      expect((response as NextResponse).status).toBe(400);
    }
    expect(mocks.author).not.toHaveBeenCalled();
    expect(mocks.learner).not.toHaveBeenCalled();
  });
  it('does not echo hidden storage details and rejects malformed JSON', async () => {
    const response = programmingErrorResponse(new Error('PRIVATE ANSWER'));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('PRIVATE');
    await expect(
      programmingJson(
        new Request('https://synthetic.invalid', { method: 'POST', body: '{' })
      )
    ).rejects.toMatchObject({ status: 400 });
  });
  it('uses current-user app sessions restricted to Learn and Teach', () => {
    expect(PROGRAMMING_SESSION_AUTH).toEqual({
      allowAppSessionAuth: { targetApp: ['learn', 'teach'] },
    });
  });
});
