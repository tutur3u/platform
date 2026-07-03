import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorkspaceExternalProjectFieldDefinition: vi.fn(),
  listWorkspaceExternalProjectFieldDefinitions: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  serverLoggerError: vi.fn(),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
}));

vi.mock('@/lib/external-projects/store', () => ({
  createWorkspaceExternalProjectFieldDefinition: (
    ...args: Parameters<
      typeof mocks.createWorkspaceExternalProjectFieldDefinition
    >
  ) => mocks.createWorkspaceExternalProjectFieldDefinition(...args),
  listWorkspaceExternalProjectFieldDefinitions: (
    ...args: Parameters<
      typeof mocks.listWorkspaceExternalProjectFieldDefinitions
    >
  ) => mocks.listWorkspaceExternalProjectFieldDefinitions(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
  },
  withRequestLogDrain: (_meta: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

describe('external project field definition route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      admin: {},
      normalizedWorkspaceId: 'ws-1',
      ok: true,
      user: {
        id: 'user-1',
      },
    });
  });

  it('requires read access before listing field definitions', async () => {
    mocks.listWorkspaceExternalProjectFieldDefinitions.mockResolvedValue([]);
    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/field-definitions/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/field-definitions?collectionId=global&includeDisabled=true'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.requireWorkspaceExternalProjectAccess).toHaveBeenCalledWith({
      mode: 'read',
      request: expect.any(Request),
      wsId: 'ws-1',
    });
    expect(
      mocks.listWorkspaceExternalProjectFieldDefinitions
    ).toHaveBeenCalledWith(
      'ws-1',
      {
        collectionId: null,
        includeDisabled: true,
      },
      {}
    );
  });

  it('rejects invalid collection filters before listing field definitions', async () => {
    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/field-definitions/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/field-definitions?collectionId=not-a-uuid'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(
      mocks.listWorkspaceExternalProjectFieldDefinitions
    ).not.toHaveBeenCalled();
  });

  it('requires manage access before creating field definitions', async () => {
    mocks.createWorkspaceExternalProjectFieldDefinition.mockResolvedValue({
      id: 'field-1',
      key: 'medium',
    });
    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/field-definitions/route'
    );

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/field-definitions',
        {
          body: JSON.stringify({
            collection_id: '00000000-0000-4000-8000-000000000001',
            field_scope: 'profile_data',
            field_type: 'string',
            key: 'medium',
          }),
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(201);
    expect(mocks.requireWorkspaceExternalProjectAccess).toHaveBeenCalledWith({
      mode: 'manage',
      request: expect.any(Request),
      wsId: 'ws-1',
    });
    expect(
      mocks.createWorkspaceExternalProjectFieldDefinition
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        field_scope: 'profile_data',
        field_type: 'string',
        key: 'medium',
        workspaceId: 'ws-1',
      }),
      {}
    );
  });
});
