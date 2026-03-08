import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getWorkspaceRouteContextMock, safeParseMock, saveFormDefinitionMock } =
  vi.hoisted(() => ({
    getWorkspaceRouteContextMock: vi.fn(),
    safeParseMock: vi.fn(),
    saveFormDefinitionMock: vi.fn(),
  }));

vi.mock('@/features/forms/route-utils', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/forms/route-utils')
  >('@/features/forms/route-utils');

  return {
    ...actual,
    getWorkspaceRouteContext: getWorkspaceRouteContextMock,
  };
});

vi.mock('@/features/forms/schema', () => ({
  formStudioSchema: {
    safeParse: safeParseMock,
  },
}));

vi.mock('@/features/forms/server', () => ({
  fetchFormDefinition: vi.fn(),
  saveFormDefinition: saveFormDefinitionMock,
}));

import { PUT } from './route';

describe('forms route PUT', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getWorkspaceRouteContextMock.mockResolvedValue({
      adminClient: { kind: 'admin-client' },
      canManageForms: true,
      canViewAnalytics: false,
      isMember: true,
      user: { id: '00000000-0000-4000-8000-000000000001' },
      wsId: '00000000-0000-4000-8000-000000000002',
    });
    safeParseMock.mockReturnValue({
      success: true,
      data: { title: 'Seeded form payload' },
    });
    saveFormDefinitionMock.mockResolvedValue(
      '50000000-0000-0000-0000-000000000001'
    );
  });

  it('accepts seeded form IDs on save requests', async () => {
    const formId = '50000000-0000-0000-0000-000000000001';
    const response = await PUT(
      new NextRequest(
        `http://localhost/api/v1/workspaces/internal/forms/${formId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title: 'Seeded form payload' }),
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'internal',
          formId,
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: formId });
    expect(saveFormDefinitionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        formId,
      })
    );
  });
});
