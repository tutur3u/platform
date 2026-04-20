import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { agentMock, requestMock } = vi.hoisted(() => ({
  agentMock: vi.fn(function MockAgent() {
    return { kind: 'proxy-dispatcher' };
  }),
  requestMock: vi.fn(),
}));

vi.mock('@/constants/common', async () => {
  const actual =
    await vi.importActual<typeof import('@/constants/common')>(
      '@/constants/common'
    );

  return {
    ...actual,
    DEV_MODE: true,
  };
});

vi.mock('undici', () => ({
  Agent: agentMock,
  request: requestMock,
}));

import { GET } from './route';

describe('tuturuuu proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('proxies development requests through undici request with the large-header dispatcher', async () => {
    requestMock.mockResolvedValue({
      statusCode: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: {
        json: vi.fn().mockResolvedValue({
          id: 'workspace_123',
          name: 'Example Workspace',
        }),
        text: vi.fn(),
      },
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/proxy/tuturuuu?path=%2Fapi%2Fv2%2Fworkspaces%2Fworkspace_123&apiUrl=https%3A%2F%2Ftuturuuu.com%2Fapi%2Fv2',
        {
          headers: {
            'X-Tuturuuu-Api-Key': 'test-api-key',
          },
        }
      )
    );

    expect(agentMock).toHaveBeenCalledWith({
      maxHeaderSize: 128 * 1024,
    });
    expect(requestMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/v2/workspaces/workspace_123',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
        },
        dispatcher: { kind: 'proxy-dispatcher' },
      }
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: 'workspace_123',
      name: 'Example Workspace',
    });
  });
});
