import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteWorkspaceExternalProjectFieldDefinition: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  serverLoggerError: vi.fn(),
  updateWorkspaceExternalProjectFieldDefinition: vi.fn(),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
}));

vi.mock('@/lib/external-projects/store', () => ({
  deleteWorkspaceExternalProjectFieldDefinition: (
    ...args: Parameters<
      typeof mocks.deleteWorkspaceExternalProjectFieldDefinition
    >
  ) => mocks.deleteWorkspaceExternalProjectFieldDefinition(...args),
  updateWorkspaceExternalProjectFieldDefinition: (
    ...args: Parameters<
      typeof mocks.updateWorkspaceExternalProjectFieldDefinition
    >
  ) => mocks.updateWorkspaceExternalProjectFieldDefinition(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
  },
  withRequestLogDrain: (_meta: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

describe('external project field definition item route', () => {
  const fieldDefinitionId = '00000000-0000-4000-8000-000000000010';

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

  it('requires manage access before updating field definitions', async () => {
    mocks.updateWorkspaceExternalProjectFieldDefinition.mockResolvedValue({
      id: 'field-1',
      label: 'Medium',
    });
    const { PATCH } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/field-definitions/[fieldDefinitionId]/route'
    );

    const response = await PATCH(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/external-projects/field-definitions/${fieldDefinitionId}`,
        {
          body: JSON.stringify({
            label: 'Medium',
          }),
          method: 'PATCH',
        }
      ),
      {
        params: Promise.resolve({
          fieldDefinitionId,
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(
      mocks.updateWorkspaceExternalProjectFieldDefinition
    ).toHaveBeenCalledWith(
      fieldDefinitionId,
      expect.objectContaining({
        actorId: 'user-1',
        label: 'Medium',
        workspaceId: 'ws-1',
      }),
      {}
    );
  });

  it('requires manage access before deleting field definitions', async () => {
    mocks.deleteWorkspaceExternalProjectFieldDefinition.mockResolvedValue({
      id: 'field-1',
    });
    const { DELETE } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/field-definitions/[fieldDefinitionId]/route'
    );

    const response = await DELETE(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/external-projects/field-definitions/${fieldDefinitionId}`,
        {
          method: 'DELETE',
        }
      ),
      {
        params: Promise.resolve({
          fieldDefinitionId,
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(
      mocks.deleteWorkspaceExternalProjectFieldDefinition
    ).toHaveBeenCalledWith(
      fieldDefinitionId,
      {
        workspaceId: 'ws-1',
      },
      {}
    );
  });

  it('rejects invalid field definition ids before updating', async () => {
    const { PATCH } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/field-definitions/[fieldDefinitionId]/route'
    );

    const response = await PATCH(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/field-definitions/not-a-uuid',
        {
          body: JSON.stringify({
            label: 'Medium',
          }),
          method: 'PATCH',
        }
      ),
      {
        params: Promise.resolve({
          fieldDefinitionId: 'not-a-uuid',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(
      mocks.updateWorkspaceExternalProjectFieldDefinition
    ).not.toHaveBeenCalled();
  });
});
