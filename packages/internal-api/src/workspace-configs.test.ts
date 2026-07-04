import { describe, expect, it, vi } from 'vitest';
import { getWorkspaceConfigs } from './workspace-configs';

function createJsonResponse(payload: unknown) {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

describe('workspace config internal-api helpers', () => {
  it('builds a deduplicated configs reader URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        BRAND_NAME: 'Tuturuuu',
        REPORT_INTRO: null,
      })
    );

    const configs = await getWorkspaceConfigs(
      'ws 1',
      ['BRAND_NAME', 'REPORT_INTRO', 'BRAND_NAME', ''],
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(configs).toEqual({
      BRAND_NAME: 'Tuturuuu',
      REPORT_INTRO: null,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws%201/settings/configs?ids=BRAND_NAME%2CREPORT_INTRO',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('does not call fetch for empty config id lists', async () => {
    const fetchMock = vi.fn();

    await expect(
      getWorkspaceConfigs('ws-1', ['', '  '], {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      })
    ).resolves.toEqual({});

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
