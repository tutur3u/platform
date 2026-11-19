import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => vi.fn());

vi.mock('@/lib/education/learner-access', () => ({
  requireLearnerWorkspace: access,
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import { GET } from './learner-progress/route';
import { POST } from './quiz-attempts/route';

const params = { params: Promise.resolve({ wsId: 'workspace' }) };

describe('learner progress routes stay off', () => {
  it('answers progress and submit with 404 before any workspace read', async () => {
    const progress = await GET(
      new NextRequest(
        'https://tuturuuu.com/api/v1/workspaces/workspace/education/learner-progress'
      ),
      params
    );
    const submit = await POST(
      new NextRequest(
        'https://tuturuuu.com/api/v1/workspaces/workspace/education/quiz-attempts',
        {
          method: 'POST',
          body: JSON.stringify({
            answers: [
              {
                quiz_id: '11111111-1111-4111-8111-111111111111',
                selected_option_id: '22222222-2222-4222-8222-222222222222',
              },
            ],
          }),
        }
      ),
      params
    );

    expect(progress?.status).toBe(404);
    expect(submit?.status).toBe(404);
    expect(access).not.toHaveBeenCalled();
  });
});
