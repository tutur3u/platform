import { describe, expect, it, vi } from 'vitest';
import {
  getAiStudioCatalog,
  getAiStudioKeys,
  getAiStudioPublicModels,
  getAiStudioRunDetail,
  getAiStudioRuns,
  getAiStudioUsage,
  runAiStudioPlayground,
} from './ai-studio';

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

  it('uses the production AI endpoint without placing the key in the URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: 'openai/gpt-5-mini',
              owned_by: 'openai',
              tuturuuu: {
                context_window: 128000,
                max_output_tokens: 8192,
                name: 'GPT 5 Mini',
                type: 'text',
              },
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          id: 'request-1',
          model: 'openai/gpt-5-mini',
          output_text: '4766',
          tuturuuu: {
            steps: [
              {
                latencyMs: 12,
                name: 'calculator',
                sequence: 1,
                status: 'succeeded',
                type: 'tool',
              },
            ],
          },
          usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
        })
      );

    await getAiStudioPublicModels('ttr_ai_secret', { fetch: fetchMock });
    const result = await runAiStudioPlayground(
      'ttr_ai_secret',
      {
        endpoint: 'responses',
        maxOutputTokens: 100,
        maxSteps: 4,
        model: 'openai/gpt-5-mini',
        prompt: '128 * 37',
        tools: ['calculator'],
      },
      { fetch: fetchMock }
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://ai.tuturuuu.com/v1/models'
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://ai.tuturuuu.com/v1/responses'
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('ttr_ai_secret');
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: { Authorization: 'Bearer ttr_ai_secret' },
      })
    );
    expect(result.steps[0]?.name).toBe('calculator');
  });

  it('encodes the workspace and run IDs for lazy trace loading', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        runId: 'run / one',
        steps: [],
      })
    );

    await getAiStudioRunDetail('workspace / one', 'run / one', {
      baseUrl: 'https://ai.example.com',
      fetch: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://ai.example.com/api/v1/workspaces/workspace%20%2F%20one/ai/runs/run%20%2F%20one',
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

  it('encodes catalog and API-key pagination cursors', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        Response.json({
          approval: {
            approved: true,
            decidedAt: null,
            decidedBy: null,
          },
          items: [],
          keys: [],
          nextCursor: null,
        })
      )
    );
    const options = {
      baseUrl: 'https://ai.example.com',
      fetch: fetchMock,
    };

    await getAiStudioCatalog(
      'workspace-1',
      'prompts',
      { cursor: 'updated~prompt-id', limit: 40 },
      options
    );
    await getAiStudioKeys(
      'workspace-1',
      { cursor: 'created~key-id', limit: 25 },
      options
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://ai.example.com/api/v1/workspaces/workspace-1/ai/catalog/prompts?cursor=updated%7Eprompt-id&limit=40',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://ai.example.com/api/v1/workspaces/workspace-1/ai/keys?cursor=created%7Ekey-id&limit=25',
      expect.objectContaining({ cache: 'no-store' })
    );
  });
});
