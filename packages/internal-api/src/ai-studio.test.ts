import { describe, expect, it, vi } from 'vitest';
import { getAiStudioRuns, getAiStudioUsage } from './ai-studio';

describe('AI Studio observability client', () => {
  it('encodes workspace IDs and bounded usage ranges', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        from: '2026-07-01T00:00:00.000Z',
        rows: [],
        to: '2026-07-29T00:00:00.000Z',
        totals: {},
      })
    );

    await getAiStudioUsage(
      'workspace / one',
      {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-29T00:00:00.000Z',
      },
      { baseUrl: 'https://ai.example.com', fetch: fetchMock }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://ai.example.com/api/v1/workspaces/workspace%20%2F%20one/ai/usage?from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-29T00%3A00%3A00.000Z',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('encodes cursor and run filters without exposing request content', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ nextCursor: null, runs: [] }));

    await getAiStudioRuns(
      'workspace-1',
      {
        cursor: '2026-07-29T00:00:00.000Z~event-id',
        feature: 'chat',
        from: '2026-07-01T00:00:00.000Z',
        limit: 50,
        model: 'openai/gpt-5-mini',
        status: 'succeeded',
        to: '2026-07-29T00:00:00.000Z',
      },
      { baseUrl: 'https://ai.example.com', fetch: fetchMock }
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('cursor=2026-07-29T00%3A00%3A00.000Z%7Eevent-id');
    expect(url).toContain('feature=chat');
    expect(url).toContain('model=openai%2Fgpt-5-mini');
    expect(url).toContain('status=succeeded');
    expect(url).not.toContain('prompt');
    expect(url).not.toContain('output');
  });
});
