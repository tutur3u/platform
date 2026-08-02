import { describe, expect, it, vi } from 'vitest';
import { executeLiveTool } from './live-tools';

describe('executeLiveTool', () => {
  it('sends the workspace tool payload with the provided abort signal', async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: { success: true } }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    );

    await expect(
      executeLiveTool(
        {
          args: { query: 'workspace summary' },
          functionName: 'search_workspace',
          wsId: 'workspace-1',
        },
        { fetch: fetchMock, signal }
      )
    ).resolves.toEqual({ result: { success: true } });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/live/tools/execute'),
      expect.objectContaining({
        body: JSON.stringify({
          args: { query: 'workspace summary' },
          functionName: 'search_workspace',
          wsId: 'workspace-1',
        }),
        method: 'POST',
        signal,
      })
    );
  });
});
