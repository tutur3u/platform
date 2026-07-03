import { handleTaskRoutePOST } from '@tuturuuu/apis/tu-do/tasks/route';
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTaskTemplateInsert,
  buildTaskTemplateUpdate,
  createTaskTemplateSchema,
  handleUnknownTaskTemplateError,
  instantiateTaskTemplate,
  instantiateTaskTemplateSchema,
  isUniqueViolation,
  normalizeTemplateSlug,
  readJson,
  requireWorkspaceTemplateMutation,
  serializeTaskTemplate,
  type TaskTemplateRow,
  type TaskTemplatesRouteContext,
  updateTaskTemplateSchema,
} from './_lib';

vi.mock('@tuturuuu/apis/tu-do/tasks/route', () => ({
  handleTaskRoutePOST: vi.fn(),
}));

const userId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const listId = '44444444-4444-4444-8444-444444444444';

const mockedHandleTaskRoutePOST = vi.mocked(handleTaskRoutePOST);

function createContext(
  overrides: Partial<TaskTemplatesRouteContext> = {}
): TaskTemplatesRouteContext {
  return {
    canManageWorkspaceTemplates: true,
    sbAdmin: {} as TaskTemplatesRouteContext['sbAdmin'],
    supabase: {} as TaskTemplatesRouteContext['supabase'],
    user: { id: userId } as TaskTemplatesRouteContext['user'],
    wsId: workspaceId,
    ...overrides,
  };
}

function createTaskListLookupClient() {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: {
        workspace_boards: {
          deleted_at: null,
          ws_id: workspaceId,
        },
      },
      error: null,
    })),
    select: vi.fn(() => query),
  };

  return {
    from: vi.fn(() => query),
    query,
  };
}

function createRow(overrides: Partial<TaskTemplateRow> = {}): TaskTemplateRow {
  return {
    archived_at: null,
    assignee_ids: [],
    created_at: '2026-06-29T00:00:00.000Z',
    created_by: userId,
    default_board_id: null,
    default_list_id: null,
    description: null,
    description_yjs_state: null,
    end_date: null,
    estimation_points: null,
    id: '33333333-3333-4333-8333-333333333333',
    label_ids: [],
    name: 'Bug report',
    priority: null,
    project_ids: [],
    slug: 'bug-report',
    source_task_id: null,
    start_date: null,
    task_name: 'Investigate bug',
    updated_at: '2026-06-29T00:00:00.000Z',
    visibility: 'private',
    ws_id: workspaceId,
    ...overrides,
  };
}

describe('task-template API helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes keys into route-safe slugs', () => {
    expect(normalizeTemplateSlug('  Bug: Report!  ')).toBe('bug-report');
    expect(() => normalizeTemplateSlug('***')).toThrow(
      'Task template key must contain a letter or number'
    );
  });

  it('builds insert payloads with workspace/user ownership and task defaults', () => {
    const parsed = createTaskTemplateSchema.parse({
      assignee_ids: ['44444444-4444-4444-8444-444444444444'],
      description: 'Reproduction steps',
      key: 'bug-report',
      label_ids: ['55555555-5555-4555-8555-555555555555'],
      name: 'Bug report',
      priority: 'high',
      task_name: 'Investigate reported bug',
      visibility: 'workspace',
    });

    expect(buildTaskTemplateInsert(parsed, createContext())).toMatchObject({
      assignee_ids: ['44444444-4444-4444-8444-444444444444'],
      created_by: userId,
      description: 'Reproduction steps',
      label_ids: ['55555555-5555-4555-8555-555555555555'],
      priority: 'high',
      slug: 'bug-report',
      task_name: 'Investigate reported bug',
      visibility: 'workspace',
      ws_id: workspaceId,
    });
  });

  it('builds partial updates without clearing omitted metadata', () => {
    const parsed = updateTaskTemplateSchema.parse({
      archived: true,
      description: null,
      key: 'Release Checklist',
      name: 'Release',
    });

    const update = buildTaskTemplateUpdate(parsed);

    expect(update).toMatchObject({
      description: null,
      name: 'Release',
      slug: 'release-checklist',
      task_name: 'Release',
    });
    expect(update.archived_at).toEqual(expect.any(String));
    expect(update).not.toHaveProperty('label_ids');
    expect(update).not.toHaveProperty('priority');
  });

  it('serializes relation arrays defensively and marks template ownership', () => {
    const row = createRow({
      assignee_ids: null as unknown as string[],
      created_by: 'other-user',
      label_ids: null as unknown as string[],
      project_ids: null as unknown as string[],
      visibility: 'workspace',
    });

    expect(serializeTaskTemplate(row, userId)).toMatchObject({
      assignee_ids: [],
      isOwner: false,
      label_ids: [],
      project_ids: [],
      visibility: 'workspace',
    });
  });

  it('requires manage permission for workspace-visible mutations only', async () => {
    const forbidden = requireWorkspaceTemplateMutation(
      createContext({ canManageWorkspaceTemplates: false }),
      'workspace'
    );
    const privateMutation = requireWorkspaceTemplateMutation(
      createContext({ canManageWorkspaceTemplates: false }),
      'private'
    );

    expect(forbidden?.status).toBe(403);
    await expect(forbidden?.json()).resolves.toMatchObject({
      error: expect.stringContaining('permission'),
    });
    expect(privateMutation).toBeNull();
  });

  it('detects Postgres unique violations and maps malformed JSON to 400', async () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: 'PGRST116' })).toBe(false);

    const request = new Request('https://example.com', {
      body: '{bad',
      method: 'POST',
    });
    await expect(readJson(request)).rejects.toThrow('Malformed JSON body');

    const response = handleUnknownTaskTemplateError(
      await readJson(request).catch((error) => error),
      'malformed json test'
    );
    expect(response.status).toBe(400);
  });

  it('instantiates task templates through the authenticated task route', async () => {
    const listLookup = createTaskListLookupClient();
    const context = createContext({
      sbAdmin: listLookup as unknown as TaskTemplatesRouteContext['sbAdmin'],
    });
    const parsed = instantiateTaskTemplateSchema.parse({
      listId,
      name: 'Override task title',
    });
    mockedHandleTaskRoutePOST.mockResolvedValueOnce(
      NextResponse.json(
        { task: { id: 'task-1', name: 'Override task title' } },
        { status: 201 }
      )
    );

    const response = await instantiateTaskTemplate(
      context,
      createRow({
        assignee_ids: ['55555555-5555-4555-8555-555555555555'],
        default_list_id: listId,
        label_ids: ['66666666-6666-4666-8666-666666666666'],
        priority: 'high',
      }),
      parsed
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      task: { id: 'task-1', name: 'Override task title' },
      template: { slug: 'bug-report' },
    });
    expect(mockedHandleTaskRoutePOST).toHaveBeenCalledOnce();

    const [taskRequest, routeContext, taskAuth] =
      mockedHandleTaskRoutePOST.mock.calls[0]!;
    await expect(taskRequest.json()).resolves.toMatchObject({
      assignee_ids: ['55555555-5555-4555-8555-555555555555'],
      label_ids: ['66666666-6666-4666-8666-666666666666'],
      listId,
      name: 'Override task title',
      priority: 'high',
    });
    await expect(routeContext.params).resolves.toEqual({ wsId: workspaceId });
    expect(taskAuth).toMatchObject({
      supabase: context.supabase,
      user: context.user,
    });
  });

  it('passes task route errors back when template instantiation cannot create a task', async () => {
    const listLookup = createTaskListLookupClient();
    const context = createContext({
      sbAdmin: listLookup as unknown as TaskTemplatesRouteContext['sbAdmin'],
    });
    mockedHandleTaskRoutePOST.mockResolvedValueOnce(
      NextResponse.json({ error: 'List not found' }, { status: 404 })
    );

    const response = await instantiateTaskTemplate(
      context,
      createRow({ default_list_id: listId }),
      instantiateTaskTemplateSchema.parse({ listId })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'List not found',
    });
  });
});
