import { type NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  executeConvertFileToMarkdown: vi.fn(),
  generateObject: vi.fn(),
  google: vi.fn(() => 'google-model'),
  requireTeachWorkspaceAccess: vi.fn(),
  serverLogger: {
    error: vi.fn(),
  },
  sessionSupabase: {
    from: vi.fn(),
  },
  withAiMemory: vi.fn(async ({ model }: { model: unknown }) => model),
}));

vi.mock('@ai-sdk/google', () => ({
  google: (...args: Parameters<typeof mocks.google>) => mocks.google(...args),
}));

vi.mock('@tuturuuu/ai/memory', () => ({
  withAiMemory: (...args: Parameters<typeof mocks.withAiMemory>) =>
    mocks.withAiMemory(...args),
}));

vi.mock('@tuturuuu/ai/tools/executors/markitdown', () => ({
  executeConvertFileToMarkdown: (
    ...args: Parameters<typeof mocks.executeConvertFileToMarkdown>
  ) => mocks.executeConvertFileToMarkdown(...args),
}));

vi.mock('ai', () => ({
  generateObject: (...args: Parameters<typeof mocks.generateObject>) =>
    mocks.generateObject(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => async (request: Request) =>
    (
      handler as (
        request: Request,
        context: {
          supabase: typeof mocks.sessionSupabase;
          user: { id: string };
        }
      ) => Promise<Response>
    )(request, {
      supabase: mocks.sessionSupabase,
      user: { id: 'user-1' },
    }),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

vi.mock('@/lib/teach/api', () => ({
  requireTeachWorkspaceAccess: (
    ...args: Parameters<typeof mocks.requireTeachWorkspaceAccess>
  ) => mocks.requireTeachWorkspaceAccess(...args),
}));

function createCourseRequest(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/ai/course', {
    body: JSON.stringify({
      fileName: 'syllabus.pdf',
      groupId: GROUP_ID,
      storagePath: `workspace-1/user-groups/${GROUP_ID}/syllabus.pdf`,
      wsId: 'workspace-1',
      ...overrides,
    }),
    method: 'POST',
  }) as NextRequest;
}

function createMaybeSingleQuery(result: { data: unknown; error: unknown }) {
  const query = {
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
  };

  return query;
}

describe('course generation route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.generateObject.mockResolvedValue({
      object: {
        modules: [
          {
            name: 'Generated module',
            sections: [
              { content: 'First section content.', title: 'First section' },
              { content: 'Second section content.', title: 'Second section' },
            ],
          },
        ],
      },
    });
    mocks.executeConvertFileToMarkdown.mockResolvedValue({
      creditsCharged: 100,
      markdown: '# Source syllabus',
      ok: true,
      title: 'Syllabus',
      truncated: false,
    });
  });

  it('requires group update and view permissions before reading storage files', async () => {
    mocks.requireTeachWorkspaceAccess.mockResolvedValue(
      NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      )
    );

    const { POST } = await import('./route');
    const response = await POST(createCourseRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions',
    });
    expect(mocks.requireTeachWorkspaceAccess).toHaveBeenCalledWith({
      context: {
        supabase: mocks.sessionSupabase,
        user: { id: 'user-1' },
      },
      permission: ['update_user_groups', 'view_user_groups'],
      wsId: 'workspace-1',
    });
    expect(mocks.executeConvertFileToMarkdown).not.toHaveBeenCalled();
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it('normalizes authorized group storage paths before conversion', async () => {
    const groupLookup = createMaybeSingleQuery({
      data: { id: GROUP_ID, ws_id: 'workspace-1' },
      error: null,
    });
    const moduleGroupLookup = createMaybeSingleQuery({
      data: { id: 'module-group-1' },
      error: null,
    });
    const maxSortKeyLookup = createMaybeSingleQuery({
      data: { sort_key: 4 },
      error: null,
    });
    const modulesTable = {
      insert: vi.fn(() => ({
        select: vi.fn(async () => ({
          data: [{ id: 'module-1', name: 'Generated module', sort_key: 5 }],
          error: null,
        })),
      })),
      select: vi.fn(() => maxSortKeyLookup),
    };
    const sbAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'workspace_user_groups') {
          return groupLookup;
        }

        if (table === 'workspace_course_module_groups') {
          return moduleGroupLookup;
        }

        if (table === 'workspace_course_modules') {
          return modulesTable;
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    mocks.requireTeachWorkspaceAccess.mockResolvedValue({
      normalizedWsId: 'workspace-1',
      sbAdmin,
      userId: 'user-1',
    });

    const { POST } = await import('./route');
    const response = await POST(
      createCourseRequest({
        storagePath: `user-groups/${GROUP_ID}/syllabus.pdf`,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      createdModules: [{ id: 'module-1', name: 'Generated module' }],
      metadata: {
        title: 'Syllabus',
        totalModules: 1,
      },
    });
    expect(mocks.executeConvertFileToMarkdown).toHaveBeenCalledWith(
      {
        fileName: 'syllabus.pdf',
        maxCharacters: 120_000,
        storagePath: `workspace-1/user-groups/${GROUP_ID}/syllabus.pdf`,
      },
      expect.objectContaining({
        supabase: mocks.sessionSupabase,
        userId: 'user-1',
        wsId: 'workspace-1',
      })
    );

    const convertContext =
      mocks.executeConvertFileToMarkdown.mock.calls[0]?.[1];
    expect(
      convertContext.canReadUserGroupStorage({
        groupId: GROUP_ID,
        storagePath: `workspace-1/user-groups/${GROUP_ID}/syllabus.pdf`,
        wsId: 'workspace-1',
      })
    ).toBe(true);
    expect(
      convertContext.canReadUserGroupStorage({
        groupId: '22222222-2222-4222-8222-222222222222',
        storagePath: `workspace-1/user-groups/${GROUP_ID}/syllabus.pdf`,
        wsId: 'workspace-1',
      })
    ).toBe(false);
  });
});
