import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceTaskTemplate,
  deleteWorkspaceTaskTemplate,
  getWorkspaceTaskTemplate,
  instantiateWorkspaceTaskTemplate,
  listWorkspaceTaskTemplates,
  saveWorkspaceTaskTemplateFromTask,
  updateWorkspaceTaskTemplate,
} from './task-templates';

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

describe('workspace task template internal-api helpers', () => {
  it('lists task templates with query params', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ templates: [] }));

    await listWorkspaceTaskTemplates(
      'ws 1',
      { includeArchived: true, q: 'bug', visibility: 'workspace' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws%201/task-templates?includeArchived=true&q=bug&visibility=workspace',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('creates task templates via POST JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        template: { id: 'template-1', name: 'Bug report' },
      })
    );

    await createWorkspaceTaskTemplate(
      'ws-1',
      {
        key: 'bug-report',
        name: 'Bug report',
        priority: 'high',
        task_name: 'Investigate bug',
        visibility: 'workspace',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/task-templates',
      expect.objectContaining({
        body: JSON.stringify({
          key: 'bug-report',
          name: 'Bug report',
          priority: 'high',
          task_name: 'Investigate bug',
          visibility: 'workspace',
        }),
        method: 'POST',
      })
    );
  });

  it('reads, updates, deletes, and instantiates templates by encoded key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createJsonResponse({ template: { id: 'template-1' } })
      );
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await getWorkspaceTaskTemplate('ws-1', 'bug report', options);
    await updateWorkspaceTaskTemplate(
      'ws-1',
      'bug report',
      { task_name: 'Investigate production bug' },
      options
    );
    await deleteWorkspaceTaskTemplate(
      'ws-1',
      'bug report',
      { permanent: true },
      options
    );
    await instantiateWorkspaceTaskTemplate(
      'ws-1',
      'bug report',
      { listId: 'list-1', name: 'Checkout bug' },
      options
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-templates/bug%20report',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-templates/bug%20report',
      expect.objectContaining({
        body: JSON.stringify({ task_name: 'Investigate production bug' }),
        method: 'PATCH',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-templates/bug%20report?permanent=true',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-templates/bug%20report/instantiate',
      expect.objectContaining({
        body: JSON.stringify({ listId: 'list-1', name: 'Checkout bug' }),
        method: 'POST',
      })
    );
  });

  it('saves task templates from an existing task', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        template: { id: 'template-1' },
      })
    );

    await saveWorkspaceTaskTemplateFromTask(
      'ws-1',
      { name: 'Release checklist', taskId: 'task-1', visibility: 'private' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/task-templates/from-task',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Release checklist',
          taskId: 'task-1',
          visibility: 'private',
        }),
        method: 'POST',
      })
    );
  });
});
