import { describe, expect, it, vi } from 'vitest';
import { getTaskScheduleBatch } from './tasks-scheduling';

describe('task scheduling batch client', () => {
  it('deduplicates and chunks 205 tasks into three bounded requests', async () => {
    const transport = vi.fn(async (url: string | URL | Request) => {
      const parsed = new URL(String(url), 'https://tasks.test');
      const ids = parsed.searchParams.get('taskIds')!.split(',');
      return new Response(
        JSON.stringify({
          minutesByTaskId: Object.fromEntries(ids.map((id) => [id, 5])),
          settingsByTaskId: {},
        }),
        { headers: { 'content-type': 'application/json' } }
      );
    });
    const ids = Array.from({ length: 205 }, (_, i) => `task-${i}`);
    const result = await getTaskScheduleBatch(
      'ws',
      [...ids, ids[0]!],
      true,
      undefined,
      { fetch: transport as typeof fetch }
    );
    expect(transport).toHaveBeenCalledTimes(3);
    expect(Object.keys(result.minutesByTaskId)).toHaveLength(205);
    expect(
      transport.mock.calls.map(
        ([url]) =>
          new URL(String(url), 'https://tasks.test').searchParams
            .get('taskIds')!
            .split(',').length
      )
    ).toEqual([100, 100, 5]);
  });
  it('rejects a failed later chunk rather than publishing a partial snapshot', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ minutesByTaskId: {}, settingsByTaskId: {} })
        )
      )
      .mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await expect(
      getTaskScheduleBatch(
        'ws',
        Array.from({ length: 101 }, (_, i) => `task-${i}`),
        false,
        undefined,
        { fetch: transport }
      )
    ).rejects.toMatchObject({ status: 503 });
  });
  it('makes no requests for an empty list', async () => {
    const transport = vi.fn();
    await getTaskScheduleBatch('ws', [], false, undefined, {
      fetch: transport,
    });
    expect(transport).not.toHaveBeenCalled();
  });
});
