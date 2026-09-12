import { describe, expect, it, vi } from 'vitest';
import { getUserTaskDashboard } from './tasks-dashboard';

describe('personal task dashboard client', () => {
  it('sends scope to the existing authenticated task feed', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          overdue: [],
          today: [],
          upcoming: [],
          totalActiveTasks: 0,
        }),
        { headers: { 'content-type': 'application/json' } }
      )
    );
    await getUserTaskDashboard(
      { wsId: 'personal-id', isPersonal: true },
      { baseUrl: 'https://internal.example.com', fetch }
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://internal.example.com/api/v1/users/me/tasks?wsId=personal-id&isPersonal=true&completedLimit=0'
    );
  });
});
