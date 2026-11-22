import { describe, expect, it, vi } from 'vitest';
import {
  removeWorkspaceExternalProjectMember,
  removeWorkspaceExternalProjectRoleMember,
} from './external-project-team';
import { InternalApiError } from './internal-api-error';

function refusal(status: number, body: Record<string, string>) {
  return vi.fn().mockResolvedValue({
    headers: new Headers(),
    json: async () => body,
    ok: false,
    status,
    text: async () => JSON.stringify(body),
  });
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the request to fail');
}

describe('CMS team removal helpers', () => {
  it('surface the status and code of a refused member removal', async () => {
    const fetchMock = refusal(409, {
      code: 'WORKSPACE_LAST_MANAGER',
      message: 'At least one member must be able to manage members',
    });

    const error = await rejection(
      removeWorkspaceExternalProjectMember(
        'ws-1',
        { userId: '22222222-2222-4222-8222-222222222222' },
        { baseUrl: 'https://app.example', fetch: fetchMock as never }
      )
    );

    expect(error).toBeInstanceOf(InternalApiError);
    expect(error).toMatchObject({
      code: 'WORKSPACE_LAST_MANAGER',
      status: 409,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/external-projects/members/access?id=22222222-2222-4222-8222-222222222222'
    );
  });

  it('surface the status and code of a refused access level removal', async () => {
    const fetchMock = refusal(403, {
      code: 'WORKSPACE_CREATOR_PROTECTED',
      message: 'The workspace creator cannot be removed',
    });

    const error = await rejection(
      removeWorkspaceExternalProjectRoleMember('ws-1', 'role-1', 'user-1', {
        baseUrl: 'https://app.example',
        fetch: fetchMock as never,
      })
    );

    expect(error).toMatchObject({
      code: 'WORKSPACE_CREATOR_PROTECTED',
      status: 403,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/external-projects/members/roles/role-1/members/user-1'
    );
  });
});
