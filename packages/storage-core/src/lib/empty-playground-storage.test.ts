import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayground } from './playground-service';
import { assertStorageUploadSize } from './storage-upload-capacity';
import {
  createWorkspaceStorageUploadPayload,
  uploadWorkspaceStorageFileDirectToProvider,
} from './workspace-storage-provider';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  secrets: vi.fn(),
  accountRpc: vi.fn(),
  send: vi.fn(),
  upload: vi.fn(),
  list: vi.fn(),
  quota: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getSecrets: mocks.secrets,
}));
vi.mock('@tuturuuu/utils/devbox-control', () => ({ notifyDevboxRun: vi.fn() }));
vi.mock('@tuturuuu/utils/account-benefits-server', () => ({
  accountPrivateRpc: mocks.accountRpc,
  AccountServiceError: class extends Error {
    constructor(readonly status: number) {
      super('Fixture service failure');
    }
  },
}));
vi.mock('@aws-sdk/client-s3', async (original) => ({
  ...(await original<typeof import('@aws-sdk/client-s3')>()),
  S3Client: class {
    send = mocks.send;
  },
}));

const actor = '00000000-0000-4000-8000-000000000001';
const projectId = '00000000-0000-4000-8000-000000000002';
const wsId = 'fixture-personal-drive';
let used: number;
let duplicate: boolean;
let replaced: number;
function configure(provider: 'supabase' | 'r2') {
  mocks.secrets.mockResolvedValue(
    provider === 'r2'
      ? Object.entries({
          DRIVE_STORAGE_PROVIDER: 'r2',
          DRIVE_R2_BUCKET: 'fixture',
          DRIVE_R2_ENDPOINT: 'https://fixture.r2.cloudflarestorage.com',
          DRIVE_R2_ACCESS_KEY_ID: 'fixture',
          DRIVE_R2_SECRET_ACCESS_KEY: 'fixture',
        }).map(([name, value]) => ({ name, value }))
      : []
  );
}
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  used = 100;
  duplicate = false;
  replaced = 0;
  configure('supabase');
  mocks.quota.mockResolvedValue({ data: 100, error: null });
  mocks.list.mockImplementation(async (_path, options) => ({
    data: options.search
      ? duplicate
        ? [{ id: 'object', name: options.search, metadata: { size: replaced } }]
        : []
      : [{ id: 'usage', name: 'existing.txt', metadata: { size: used } }],
    error: null,
  }));
  mocks.upload.mockImplementation(async (path) => ({
    data: { path, fullPath: path },
    error: null,
  }));
  mocks.remove.mockResolvedValue({ error: null });
  mocks.admin.mockResolvedValue({
    rpc: mocks.quota,
    storage: {
      from: () => ({
        list: mocks.list,
        upload: mocks.upload,
        remove: mocks.remove,
      }),
    },
  });
  mocks.send.mockImplementation(async (command) => {
    switch (command.constructor.name) {
      case 'HeadObjectCommand':
        if (duplicate) return { ContentLength: replaced };
        throw Object.assign(new Error('Fixture missing'), { name: 'NotFound' });
      case 'ListObjectsV2Command':
        return { Contents: [{ Key: `${wsId}/existing.txt`, Size: used }] };
      default:
        return {};
    }
  });
  mocks.accountRpc.mockImplementation(async (name) => {
    if (name === 'create_learn_playground') return projectId;
    if (name === 'read_learn_playgrounds')
      return {
        personalWorkspaceId: wsId,
        allowed: true,
        projects: [
          {
            id: projectId,
            name: 'Fixture',
            language: 'python',
            revision: 0,
            drive_path: null,
            file_manifest: [],
            command: 'python main.py',
            active_run: null,
          },
        ],
      };
    return 1;
  });
});

describe.each(['supabase', 'r2'] as const)(
  'empty checkpoints through real %s provider guards',
  (provider) => {
    beforeEach(() => configure(provider));
    it('creates and publishes a genuinely empty IDE at an exact positive quota', async () => {
      await expect(
        createPlayground(
          actor,
          { name: 'Fixture', language: 'python' },
          undefined,
          { empty: true }
        )
      ).resolves.toEqual({ id: projectId });
      const bytes =
        provider === 'supabase'
          ? mocks.upload.mock.calls[0]?.[1]
          : mocks.send.mock.calls.find(
              ([command]) => command.constructor.name === 'PutObjectCommand'
            )?.[0].input.Body;
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.byteLength).toBe(0);
      expect(mocks.accountRpc).toHaveBeenCalledWith(
        'publish_learn_playground',
        expect.objectContaining({
          p_manifest: [expect.objectContaining({ path: 'main.py', size: 0 })],
        })
      );
      expect(mocks.accountRpc).not.toHaveBeenCalledWith(
        'discard_uninitialized_playground',
        expect.anything()
      );
    });
    it.each([101, Number.NaN, -1, 0.5])(
      'denies empty writes with invalid or over-quota usage %s',
      async (usage) => {
        used = usage;
        await expect(
          uploadWorkspaceStorageFileDirectToProvider(
            wsId,
            provider,
            'main.py',
            new Uint8Array(),
            { allowEmpty: true }
          )
        ).rejects.toBeDefined();
        expect(mocks.upload).not.toHaveBeenCalled();
        expect(
          mocks.send.mock.calls.some(
            ([command]) => command.constructor.name === 'PutObjectCommand'
          )
        ).toBe(false);
      }
    );
    it.each([null, 0, -1, 0.5])(
      'denies empty writes when quota is unknown or invalid: %s',
      async (limit) => {
        used = 0;
        mocks.quota.mockResolvedValue({ data: limit, error: null });
        await expect(
          uploadWorkspaceStorageFileDirectToProvider(
            wsId,
            provider,
            'main.py',
            new Uint8Array(),
            { allowEmpty: true }
          )
        ).rejects.toMatchObject({ status: 413 });
      }
    );
    it('does not publish and discards only the uninitialized project when quota lookup fails', async () => {
      used = 0;
      mocks.quota.mockResolvedValue({
        data: null,
        error: { message: 'Fixture unavailable' },
      });
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      try {
        await expect(
          createPlayground(
            actor,
            { name: 'Fixture', language: 'python' },
            undefined,
            { empty: true }
          )
        ).rejects.toMatchObject({ status: 500 });
        expect(mocks.accountRpc).not.toHaveBeenCalledWith(
          'publish_learn_playground',
          expect.anything()
        );
        expect(mocks.accountRpc).toHaveBeenCalledWith(
          'discard_uninitialized_playground',
          { p_actor_id: actor, p_id: projectId }
        );
        expect(mocks.upload).not.toHaveBeenCalled();
        expect(
          mocks.send.mock.calls.some(
            ([command]) => command.constructor.name === 'PutObjectCommand'
          )
        ).toBe(false);
      } finally {
        consoleError.mockRestore();
      }
    });
    it('keeps duplicate protection before empty uploads', async () => {
      duplicate = true;
      await expect(
        uploadWorkspaceStorageFileDirectToProvider(
          wsId,
          provider,
          'main.py',
          new Uint8Array(),
          { allowEmpty: true }
        )
      ).rejects.toMatchObject({ status: 409 });
    });
    it('counts replaced bytes for an empty overwrite', async () => {
      used = 105;
      duplicate = true;
      replaced = 5;
      await expect(
        uploadWorkspaceStorageFileDirectToProvider(
          wsId,
          provider,
          'main.py',
          new Uint8Array(),
          { allowEmpty: true, upsert: true }
        )
      ).resolves.toMatchObject({ provider });
    });
    it('requires explicit opt-in for direct empty buffers', async () => {
      await expect(
        uploadWorkspaceStorageFileDirectToProvider(
          wsId,
          provider,
          'main.py',
          new Uint8Array()
        )
      ).rejects.toMatchObject({ status: 400 });
    });
  }
);

it.each([0, -1, 0.5])(
  'keeps signed-upload declared size %s rejection',
  async (size) => {
    await expect(
      createWorkspaceStorageUploadPayload(wsId, 'main.py', { size })
    ).rejects.toMatchObject({ status: 400 });
  }
);

it.each([undefined, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
  'empty opt-in cannot admit invalid byte size %s',
  (size) => {
    expect(() => assertStorageUploadSize(size, true)).toThrow(
      'valid file size'
    );
  }
);
