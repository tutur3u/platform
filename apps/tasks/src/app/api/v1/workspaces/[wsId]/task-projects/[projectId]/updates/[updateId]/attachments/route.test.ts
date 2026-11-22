// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WS = '5707a6e0-0000-4000-8000-000000009711';
const PROJECT = '5707a6e0-0000-4000-8000-000000009721';
const UPDATE = '5707a6e0-0000-4000-8000-000000009731';
const FOLDER = `${WS}/project-updates/${UPDATE}`;

// Spellings Postgres accepts for the same uuid values.
const ALIASES = {
  brace: (id: string) => `{${id}}`,
  'no-hyphen': (id: string) => id.replaceAll('-', ''),
  uppercase: (id: string) => id.toUpperCase(),
};

const mocks = vi.hoisted(() => {
  const createSignedUrl = vi.fn();
  const remove = vi.fn();
  const upload = vi.fn();
  const userStorage = vi.fn();
  const rows: Record<string, unknown> = {};
  const errors: Record<string, unknown> = {};
  const query = (table: string) => {
    const chain = {
      delete: () => chain,
      eq: () => chain,
      insert: () => chain,
      select: () => chain,
      single: async () =>
        errors[table]
          ? { data: null, error: errors[table] }
          : { data: rows[table], error: null },
      then: (resolve: (value: { error: null }) => unknown) =>
        resolve({ error: null }),
    };
    return chain;
  };
  // project-updates is service-only: the user client must never touch it.
  const supabase = {
    from: (table: string) => query(table),
    storage: { from: userStorage },
  };
  const adminStorage = { createSignedUrl, remove, upload };

  return {
    adminStorage,
    createSignedUrl,
    errors,
    remove,
    rows,
    supabase,
    upload,
    userStorage,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: async () => ({
    storage: { from: () => mocks.adminStorage },
  }),
}));

vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    authError: null,
    supabase: mocks.supabase,
    user: { id: 'user-1' },
  }),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async () => ({ ok: true, type: 'MEMBER' }),
}));

// Database rows always carry canonical uuids, whatever spelling matched them.
function resetRows() {
  for (const table of Object.keys(mocks.errors)) delete mocks.errors[table];
  mocks.rows.task_project_update_attachments = { id: 'attachment-1' };
  mocks.rows.task_project_updates = { id: UPDATE, project_id: PROJECT };
  mocks.rows.task_projects = { id: PROJECT, ws_id: WS };
}

function params(wsId = WS, updateId = UPDATE) {
  return {
    params: Promise.resolve({ projectId: PROJECT, updateId, wsId }),
  };
}

describe('POST project update attachment', () => {
  async function postAttachment(
    fileName: string,
    wsId = WS,
    updateId = UPDATE
  ) {
    const body = new FormData();
    body.append('file', new File(['hello'], fileName, { type: 'text/plain' }));
    const { POST } = await import('./route');
    return POST(
      new NextRequest(
        `https://tasks.tuturuuu.com/api/v1/workspaces/${wsId}/task-projects/${PROJECT}/updates/${updateId}/attachments`,
        { body, method: 'POST' }
      ),
      params(wsId, updateId)
    );
  }

  function uploadedPath() {
    return mocks.upload.mock.calls[0]?.[0] as string | undefined;
  }

  beforeEach(() => {
    resetRows();
    mocks.userStorage.mockReset();
    mocks.remove.mockReset();
    mocks.remove.mockResolvedValue({ data: [], error: null });
    mocks.upload.mockReset();
    mocks.upload.mockImplementation(async (path: string) => ({
      data: { path },
      error: null,
    }));
    mocks.createSignedUrl.mockReset();
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example/signed' },
      error: null,
    });
  });

  it('returns a signed preview link that lasts at most 15 minutes', async () => {
    const response = await postAttachment('notes.txt');

    expect(response.status).toBe(201);
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1);
    const [path, expiresIn] = mocks.createSignedUrl.mock.calls[0] ?? [];
    expect(path).toMatch(new RegExp(`^${FOLDER}/[0-9a-f-]{36}\\.txt$`, 'u'));
    expect(expiresIn).toBeLessThanOrEqual(15 * 60);
    await expect(response.json()).resolves.toMatchObject({
      signedUrl: 'https://storage.example/signed',
    });
    expect(mocks.userStorage).not.toHaveBeenCalled();
  });

  it.each(Object.entries(ALIASES))(
    'writes into the canonical folder for %s workspace and update ids',
    async (_, alias) => {
      const response = await postAttachment(
        'notes.txt',
        alias(WS),
        alias(UPDATE)
      );

      expect(response.status).toBe(201);
      expect(uploadedPath()).toMatch(
        new RegExp(`^${FOLDER}/[0-9a-f-]{36}\\.txt$`, 'u')
      );
    }
  );

  it.each([
    ['an extension containing a slash', 'notes.tx/t'],
    ['a traversal extension', 'notes./../../docs/x'],
    ['an overlong extension', 'archive.abcdefghijk'],
    ['a non-alphanumeric extension', 'clip.p_g'],
  ])('drops %s', async (_, fileName) => {
    const response = await postAttachment(fileName);

    expect(response.status).toBe(201);
    expect(uploadedPath()).toMatch(
      new RegExp(`^${FOLDER}/[0-9a-f-]{36}$`, 'u')
    );
  });

  it('logs only the error code when removing an orphaned upload fails', async () => {
    mocks.errors.task_project_update_attachments = { code: '23503' };
    mocks.remove.mockResolvedValue({
      data: null,
      error: Object.assign(new Error(`cannot remove ${FOLDER}/x.txt`), {
        name: 'StorageApiError',
        statusCode: '403',
      }),
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const response = await postAttachment('notes.txt');

    expect(response.status).toBe(500);
    expect(mocks.remove).toHaveBeenCalledWith([uploadedPath()]);
    expect(consoleError).toHaveBeenCalledWith(
      'PROJECT_UPDATE_ATTACHMENT_CLEANUP_FAILED',
      { code: '403' }
    );
    for (const call of consoleError.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('project-updates');
    }
    consoleError.mockRestore();
  });

  it('keeps a short alphanumeric extension in lowercase', async () => {
    await postAttachment('Clip.PNG');

    expect(uploadedPath()).toMatch(
      new RegExp(`^${FOLDER}/[0-9a-f-]{36}\\.png$`, 'u')
    );
  });
});

describe('DELETE project update attachment', () => {
  const ATTACHMENT_ID = '5707a6e0-0000-4000-8000-000000009801';

  async function deleteAttachment(
    filePath: string,
    wsId = WS,
    updateId = UPDATE
  ) {
    mocks.rows.task_project_update_attachments = {
      file_path: filePath,
      id: ATTACHMENT_ID,
      update_id: UPDATE,
      uploaded_by: 'user-1',
    };
    const { DELETE } = await import('./route');
    return DELETE(
      new NextRequest(
        `https://tasks.tuturuuu.com/api/v1/workspaces/${wsId}/task-projects/${PROJECT}/updates/${updateId}/attachments?attachmentId=${ATTACHMENT_ID}`,
        { method: 'DELETE' }
      ),
      params(wsId, updateId)
    );
  }

  beforeEach(() => {
    resetRows();
    mocks.remove.mockReset();
    mocks.remove.mockResolvedValue({ data: [], error: null });
    mocks.userStorage.mockReset();
  });

  it('removes the object inside its update folder with the service client', async () => {
    const response = await deleteAttachment(`${FOLDER}/file.pdf`);

    expect(response.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith([`${FOLDER}/file.pdf`]);
    expect(mocks.userStorage).not.toHaveBeenCalled();
  });

  it.each([
    `${WS}/docs/report.pdf`,
    `5707a6e0-0000-4000-8000-000000009712/project-updates/${UPDATE}/file.pdf`,
    `${WS}/project-updates/5707a6e0-0000-4000-8000-000000009732/file.pdf`,
    `${FOLDER}/../../docs/report.pdf`,
    `${FOLDER}/`,
    `{${WS}}/project-updates/${UPDATE}/file.pdf`,
    `${WS.toUpperCase()}/project-updates/${UPDATE}/file.pdf`,
  ])('never removes the stored path %s', async (filePath) => {
    const response = await deleteAttachment(filePath);

    expect(response.status).toBe(200);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each(Object.entries(ALIASES))(
    'never removes storage for %s workspace and update ids',
    async (_, alias) => {
      await deleteAttachment(
        `${alias(WS)}/project-updates/${alias(UPDATE)}/file.pdf`,
        alias(WS),
        alias(UPDATE)
      );

      expect(mocks.remove).not.toHaveBeenCalled();
    }
  );
});
