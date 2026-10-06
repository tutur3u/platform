import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type BannerObjectInfo = NonNullable<
  Awaited<
    ReturnType<ReturnType<SupabaseClient['storage']['from']>['info']>
  >['data']
>;

const f = vi.hoisted(() => ({
  rpc: vi.fn(),
  info: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: f.admin,
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));

import { POST } from './route';

const actor = '00000000-0000-4000-8000-000000000001';
const operationId = '00000000-0000-4000-8000-000000000002';
const origin = 'https://storage.example.test';
const path = `${actor}/${operationId}.png`;
const url = `${origin}/storage/v1/object/public/banners/${path}`;
const invoke = (body: unknown) =>
  (POST as unknown as (req: Request, ctx: unknown) => Promise<Response>)(
    new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { user: { id: actor } }
  );
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', origin);
  f.admin.mockResolvedValue({
    rpc: f.rpc,
    storage: {
      from: vi
        .fn()
        .mockReturnValue({ info: f.info, remove: f.remove, upload: f.upload }),
    },
  });
  f.rpc.mockImplementation(async (name: string) => ({
    error: null,
    data:
      name === 'profile_banner_operation_status'
        ? { state: 'issued', file_path: path, public_url: url }
        : name === 'pending_profile_banner_retirements'
          ? []
          : name === 'commit_profile_banner_operation'
            ? { state: 'committed' }
            : null,
  }));
  f.info.mockResolvedValue({
    error: null,
    data: { size: 100, contentType: 'image/png' } satisfies Pick<
      BannerObjectInfo,
      'size' | 'contentType'
    >,
  });
  f.remove.mockResolvedValue({ error: null });
  f.upload.mockResolvedValue({ error: null });
});
describe('receipt-based banner lifecycle', () => {
  it.each(['finalize', 'remove'])(
    'rejects switched actor %s before any privileged effects',
    async (action) => {
      const response = await invoke({
        action,
        operationId,
        expectedActorId: '00000000-0000-4000-8000-000000000003',
      });
      expect(response.status).toBe(409);
      expect(f.admin).not.toHaveBeenCalled();
      expect(f.rpc).not.toHaveBeenCalled();
      expect(f.info).not.toHaveBeenCalled();
      expect(f.remove).not.toHaveBeenCalled();
      expect(f.upload).not.toHaveBeenCalled();
    }
  );
  it.each(['finalize', 'remove'])(
    'admits matching expected actor for %s',
    async (action) => {
      expect(
        (await invoke({ action, operationId, expectedActorId: actor })).status
      ).toBe(200);
      expect(f.rpc).toHaveBeenCalledWith('commit_profile_banner_operation', {
        p_user_id: actor,
        p_operation_id: operationId,
        p_storage_origin: origin,
        p_remove: action === 'remove',
      });
    }
  );

  it('uses resolved actor, not forged request actor', async () => {
    expect(
      (await invoke({ action: 'finalize', operationId, userId: 'foreign' }))
        .status
    ).toBe(200);
    expect(f.rpc).toHaveBeenCalledWith('commit_profile_banner_operation', {
      p_user_id: actor,
      p_operation_id: operationId,
      p_storage_origin: origin,
      p_remove: false,
    });
  });
  it('replays committed upload without requiring deleted old object or updating current', async () => {
    f.rpc.mockImplementation(async (name: string) => ({
      error: null,
      data:
        name === 'profile_banner_operation_status'
          ? { state: 'committed' }
          : [],
    }));
    expect((await invoke({ action: 'finalize', operationId })).status).toBe(
      200
    );
    expect(f.info).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalledWith(
      'commit_profile_banner_operation',
      expect.anything()
    );
  });
  it('rejects foreign receipt path before privileged object access', async () => {
    f.rpc.mockResolvedValue({
      error: null,
      data: {
        state: 'issued',
        file_path: path,
        public_url: url.replace(actor, operationId),
      },
    });
    expect((await invoke({ action: 'finalize', operationId })).status).toBe(
      400
    );
    expect(f.info).not.toHaveBeenCalled();
  });
  it('never commits unavailable object', async () => {
    f.info.mockResolvedValue({ data: null, error: { statusCode: 404 } });
    expect((await invoke({ action: 'finalize', operationId })).status).toBe(
      503
    );
    expect(f.rpc).not.toHaveBeenCalledWith(
      'commit_profile_banner_operation',
      expect.anything()
    );
  });
  it('rejects SDK object metadata with missing content type', async () => {
    f.info.mockResolvedValue({
      error: null,
      data: { size: 100 } satisfies Pick<
        BannerObjectInfo,
        'size' | 'contentType'
      >,
    });
    expect((await invoke({ action: 'finalize', operationId })).status).toBe(
      400
    );
    expect(f.rpc).toHaveBeenCalledWith('abandon_profile_banner_operation', {
      p_user_id: actor,
      p_operation_id: operationId,
      p_storage_origin: origin,
    });
    expect(f.rpc).not.toHaveBeenCalledWith(
      'commit_profile_banner_operation',
      expect.anything()
    );
  });
  it.each([null, 12, {}, 'text/plain'])(
    'rejects invalid content type %j',
    async (contentType) => {
      f.info.mockResolvedValue({
        error: null,
        data: { size: 100, contentType },
      });
      expect((await invoke({ action: 'finalize', operationId })).status).toBe(
        400
      );
      expect(f.rpc).not.toHaveBeenCalledWith(
        'commit_profile_banner_operation',
        expect.anything()
      );
    }
  );
  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])(
    'accepts supported content type %s',
    async (contentType) => {
      f.info.mockResolvedValue({
        error: null,
        data: { size: 100, contentType } satisfies Pick<
          BannerObjectInfo,
          'size' | 'contentType'
        >,
      });
      expect((await invoke({ action: 'finalize', operationId })).status).toBe(
        200
      );
    }
  );
  it.each([0, -1, 5 * 1024 * 1024 + 1, '100'])(
    'rejects invalid object size %j',
    async (size) => {
      f.info.mockResolvedValue({
        error: null,
        data: { size, contentType: 'image/png' },
      });
      expect((await invoke({ action: 'finalize', operationId })).status).toBe(
        400
      );
      expect(f.rpc).not.toHaveBeenCalledWith(
        'commit_profile_banner_operation',
        expect.anything()
      );
    }
  );
  it('reports durable cleanup failure after commit so receipt can safely retry', async () => {
    f.rpc.mockImplementation(async (name: string) => ({
      error: null,
      data:
        name === 'pending_profile_banner_retirements'
          ? [{ public_url: url, file_path: path, delete_ready: true }]
          : name === 'commit_profile_banner_operation'
            ? { state: 'committed' }
            : null,
    }));
    f.remove.mockResolvedValue({
      error: { message: 'synthetic storage outage' },
    });
    const response = await invoke({ action: 'remove', operationId });
    expect(response.status).toBe(503);
    expect((await response.json()).committed).toBe(true);
    expect(f.rpc).not.toHaveBeenCalledWith(
      'complete_profile_banner_retirement',
      expect.anything()
    );
  });
  it('returns conflict after intervening edit while still sweeping retired staged object', async () => {
    f.rpc.mockImplementation(async (name: string) => ({
      error: null,
      data:
        name === 'profile_banner_operation_status'
          ? { state: 'issued', file_path: path, public_url: url }
          : name === 'commit_profile_banner_operation'
            ? { state: 'conflict' }
            : [],
    }));
    expect((await invoke({ action: 'finalize', operationId })).status).toBe(
      409
    );
  });
});
