import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPlayground,
  getPlayground,
  savePlayground,
} from './playground-service';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
  provider: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/account-benefits-server', () => ({
  accountPrivateRpc: mocks.rpc,
  AccountServiceError: class extends Error {
    constructor(readonly status: number) {
      super('Fixture request failed');
    }
  },
}));
vi.mock('@tuturuuu/utils/devbox-control', () => ({ notifyDevboxRun: vi.fn() }));
vi.mock('./workspace-storage-provider', () => ({
  uploadWorkspaceStorageFileDirect: mocks.upload,
  downloadWorkspaceStorageObjectForProvider: mocks.download,
  deleteWorkspaceStorageObjectByPath: mocks.remove,
  resolveWorkspaceStorageProvider: mocks.provider,
}));
const actor = '00000000-0000-4000-8000-000000000001';
const projectId = '00000000-0000-4000-8000-000000000002';
const personalWorkspaceId = 'personal-drive';
const pointer = (path: string, content: string) => ({
  path,
  storagePath: `playgrounds/${projectId}/previous/${path}`,
  sha256: createHash('sha256').update(content).digest('hex'),
  size: Buffer.byteLength(content),
});
function project(
  manifest = [pointer('main.py', 'old'), pointer('keep.txt', 'keep')]
) {
  return {
    id: projectId,
    name: 'Fixture',
    language: 'python',
    revision: 2,
    drive_path: 'old-root',
    file_manifest: manifest,
    command: 'python main.py',
    active_run: null,
  };
}
function seed(row = project(), allowed = true) {
  mocks.rpc.mockImplementation(async (name: string) =>
    name === 'read_learn_playgrounds'
      ? { personalWorkspaceId, allowed, projects: [row] }
      : 3
  );
}
describe('personal Drive playground checkpoints', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.provider.mockResolvedValue({ provider: 'fixture' });
    mocks.upload.mockResolvedValue({});
    mocks.remove.mockResolvedValue(undefined);
    seed();
  });
  it('uploads only changed files to the personal workspace without downloading unchanged files', async () => {
    await savePlayground(actor, projectId, {
      revision: 2,
      command: 'python main.py',
      files: [{ path: 'main.py', content: 'new' }],
      paths: ['main.py', 'keep.txt'],
    });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload.mock.calls[0]?.[0]).toBe(personalWorkspaceId);
    const publication = mocks.rpc.mock.calls.find(
      ([name]) => name === 'publish_learn_playground'
    )?.[1];
    expect(
      publication.p_manifest.find(
        (entry: { path: string }) => entry.path === 'keep.txt'
      )
    ).toEqual(pointer('keep.txt', 'keep'));
    expect(publication.p_actor_id).toBe(actor);
  });
  it('no-op saves reuse immutable objects and return the previous Drive path', async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === 'read_learn_playgrounds'
        ? { personalWorkspaceId, allowed: true, projects: [project()] }
        : 2
    );
    expect(
      await savePlayground(actor, projectId, {
        revision: 2,
        command: 'python main.py',
        files: [{ path: 'main.py', content: 'old' }],
        paths: ['main.py', 'keep.txt'],
      })
    ).toEqual({ revision: 2, drivePath: 'old-root' });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('rejects bad inventories, stale revisions and revoked entitlements before spending Drive bytes', async () => {
    await expect(
      savePlayground(actor, projectId, {
        revision: 2,
        command: 'python main.py',
        files: [],
        paths: ['missing.txt'],
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      savePlayground(actor, projectId, {
        revision: 1,
        command: 'python main.py',
        files: [],
      })
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      savePlayground(actor, projectId, {
        revision: 2,
        command: 'python main.py',
        files: [{ path: '../escape', content: 'bad' }],
      })
    ).rejects.toMatchObject({ status: 400 });
    seed(project(), false);
    await expect(
      savePlayground(actor, projectId, {
        revision: 2,
        command: 'python main.py',
        files: [],
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('CAS failures remove only this save attempt, preserving existing immutable checkpoints', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'read_learn_playgrounds')
        return { personalWorkspaceId, allowed: true, projects: [project()] };
      throw Object.assign(new Error('Conflict'), { status: 409 });
    });
    await expect(
      savePlayground(actor, projectId, {
        revision: 2,
        command: 'python main.py',
        files: [{ path: 'main.py', content: 'new' }],
        paths: ['main.py', 'keep.txt'],
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(
      personalWorkspaceId,
      mocks.upload.mock.calls[0]?.[1]
    );
    expect(mocks.remove.mock.calls[0]?.[1]).not.toContain('/previous/');
  });
  it('detects external Drive changes instead of loading bytes under an obsolete manifest', async () => {
    mocks.download.mockResolvedValue({ buffer: Buffer.from('external edit') });
    await expect(getPlayground(actor, projectId)).rejects.toMatchObject({
      status: 409,
    });
  });
  it('bounds download concurrency and rejects foreign Drive pointers', async () => {
    let active = 0;
    let peak = 0;
    seed(
      project(Array.from({ length: 5 }, (_, i) => pointer(`${i}.py`, 'text')))
    );
    mocks.download.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return { buffer: Buffer.from('text') };
    });
    expect((await getPlayground(actor, projectId)).files).toHaveLength(5);
    expect(peak).toBe(2);
    seed(
      project([
        {
          ...pointer('main.py', 'old'),
          storagePath: 'another-project/main.py',
        },
      ])
    );
    mocks.download.mockClear();
    await expect(getPlayground(actor, projectId)).rejects.toThrow();
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('discards only the new uninitialized project when its template cannot be saved', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'create_learn_playground') return projectId;
      if (name === 'read_learn_playgrounds')
        return {
          personalWorkspaceId,
          allowed: true,
          projects: [{ ...project([]), revision: 0, drive_path: null }],
        };
      return null;
    });
    mocks.upload.mockRejectedValue(new Error('fixture storage unavailable'));
    await expect(
      createPlayground(actor, { name: 'Fixture', language: 'python' })
    ).rejects.toBeDefined();
    expect(mocks.rpc).toHaveBeenCalledWith('discard_uninitialized_playground', {
      p_actor_id: actor,
      p_id: projectId,
    });
  });
});
