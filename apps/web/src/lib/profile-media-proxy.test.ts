// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { PROFILE_MEDIA_MAX_BYTES } from '@tuturuuu/storage-core/profile-upload-budget';
import type { SecurityBudgetDimension } from '@tuturuuu/storage-core/security-budget';
import { createAppCoordinationToken } from '@tuturuuu/utils/app-coordination-token';
import { MAX_PAYLOAD_SIZE } from '@tuturuuu/utils/constants';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  budget: vi.fn(),
  admin: vi.fn(),
  upload: vi.fn(),
  rpc: vi.fn(),
  cost: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/storage-core/security-budget', () => ({
  reserveSecurityBudget: f.budget,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: f.admin,
  createClient: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  getMalformedSupabaseAuthCookieNames: () => [],
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  createCentralizedAuthProxy: () => vi.fn(),
  propagateAuthCookies: vi.fn(),
}));
vi.mock('@tuturuuu/auth/cli-session', () => ({
  verifyCliAccessToken: vi.fn(),
}));
vi.mock('@tuturuuu/utils/user-helper', () => ({
  getUserDefaultWorkspace: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: vi.fn(),
  isWorkspaceUuidLiteral: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));
vi.mock('@/lib/locale-proxy', () => ({ handleLocale: vi.fn() }));
vi.mock('@/lib/api-cost-guard', () => ({ guardApiCost: f.cost }));

import { PUT as avatarPut } from '@/app/api/v1/users/me/avatar/upload/route';
import { PUT as bannerPut } from '@/app/api/v1/users/me/banner/upload/route';
import { proxy } from '../proxy';

const actor = randomUUID();
const operation = randomUUID();
const kinds = ['avatar', 'banner'] as const;
const consumed = new Set<string>();

function ticket(kind: (typeof kinds)[number]) {
  return createAppCoordinationToken({
    userId: actor,
    targetApp: 'profile-media-upload',
    scopes: [
      `profile-media:${kind}`,
      ...(kind === 'banner' ? [`banner-operation:${operation}`] : []),
    ],
    expiresInSeconds: 600,
  });
}

async function image(bytes?: number) {
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#123456' },
  })
    .png()
    .toBuffer();
  // Pad after IEND to exercise the source cap with a decodable PNG.
  return bytes ? Buffer.concat([png, Buffer.alloc(bytes - png.length)]) : png;
}

function request({
  kind = 'avatar',
  body,
  token = ticket(kind).token,
  length,
  method = 'PUT',
  path = `/api/v1/users/me/${kind}/upload`,
}: {
  kind?: (typeof kinds)[number];
  body: Buffer;
  token?: string;
  length?: string;
  method?: string;
  path?: string;
}) {
  return new NextRequest(`https://app.test${path}?token=${token}`, {
    method,
    headers: {
      'content-type': 'image/png',
      'user-agent': 'Dart/3.12 (dart:io)',
      ...(length === undefined ? {} : { 'content-length': length }),
    },
    body: new Uint8Array(body),
  });
}

async function dispatch(req: NextRequest, kind: (typeof kinds)[number]) {
  const ingress = await proxy(req);
  if (ingress.headers.get('x-middleware-next') !== '1') return ingress;
  return (kind === 'avatar' ? avatarPut : bannerPut)(req);
}

beforeEach(() => {
  vi.clearAllMocks();
  consumed.clear();
  f.cost.mockResolvedValue(null);
  f.budget.mockImplementation(async (dimensions: SecurityBudgetDimension[]) => {
    const key = dimensions[0]?.[0];
    if (!key?.includes(':profile-upload:ticket:'))
      throw new Error('Unexpected non-ticket reservation');
    if (consumed.has(key)) return [0, 1];
    consumed.add(key);
    return [1, 0];
  });
  f.upload.mockResolvedValue({ error: null });
  f.rpc.mockResolvedValue({
    data: { state: 'issued', file_path: `${actor}/${operation}.webp` },
    error: null,
  });
  f.admin.mockResolvedValue({
    rpc: f.rpc,
    storage: {
      from: () => ({
        upload: f.upload,
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://storage.test/${path}` },
        }),
      }),
    },
  });
});

it.each(kinds)(
  'passes a small %s image through the actual proxy and route, storing re-encoded WebP',
  async (kind) => {
    const body = await image();
    const response = await dispatch(
      request({ kind, body, length: String(body.length) }),
      kind
    );
    expect(response.status).toBe(200);
    expect(f.budget).toHaveBeenCalledTimes(1);
    expect(f.upload).toHaveBeenCalledWith(
      expect.stringMatching(/\.webp$/),
      expect.any(Buffer),
      { contentType: 'image/webp', upsert: false, cacheControl: '31536000' }
    );
    const stored: unknown = f.upload.mock.calls[0]?.[1];
    if (!Buffer.isBuffer(stored))
      throw new Error('Expected stored image bytes');
    expect((await sharp(stored).metadata()).format).toBe('webp');
    expect(stored.equals(body)).toBe(false);
    expect(f.cost).toHaveBeenCalledTimes(1);
  }
);

it.each(
  kinds.flatMap((kind) =>
    ['declared', 'absent', 'understated'].map((length) => ({ kind, length }))
  )
)(
  'admits the exact $kind source cap with $length Content-Length',
  async ({ kind, length }) => {
    const body = await image(PROFILE_MEDIA_MAX_BYTES[kind]);
    const req = request({
      kind,
      body,
      length:
        length === 'declared'
          ? String(body.length)
          : length === 'understated'
            ? '1'
            : undefined,
    });
    const response = await dispatch(req, kind);
    expect(response.status).toBe(200);
    expect(f.upload).toHaveBeenCalledTimes(1);
    expect(f.budget).toHaveBeenCalledTimes(1);
  }
);

it.each(
  kinds.flatMap((kind) =>
    ['declared', 'absent', 'understated'].map((length) => ({ kind, length }))
  )
)(
  'rejects $kind cap+1 with $length Content-Length before ticket consumption',
  async ({ kind, length }) => {
    const body = await image(PROFILE_MEDIA_MAX_BYTES[kind] + 1);
    const response = await dispatch(
      request({
        kind,
        body,
        length:
          length === 'declared'
            ? String(body.length)
            : length === 'understated'
              ? '1'
              : undefined,
      }),
      kind
    );
    expect(response.status).toBe(413);
    expect(f.budget).not.toHaveBeenCalled();
    expect(f.upload).not.toHaveBeenCalled();
  }
);

it.each([
  ['POST', '/api/v1/users/me/avatar/upload'],
  ['POST', '/api/v1/users/me/banner/upload'],
  ['POST', '/api/v1/users/me/avatar/upload-url'],
  ['POST', '/api/v1/users/me/banner/upload-url'],
  ['PUT', '/api/v1/users/me/avatar/upload/'],
  ['PUT', '/api/v1/users/me/banner/upload/other'],
  ['PUT', '/api/v1/users/me/avatar'],
  ['PUT', '/api/v1/other'],
])('preserves the generic 512 KiB cap for %s %s', async (method, path) => {
  const response = await proxy(
    request({ method, path, body: Buffer.alloc(MAX_PAYLOAD_SIZE + 1) })
  );
  expect(response.status).toBe(413);
  expect(f.budget).not.toHaveBeenCalled();
});

it('preserves the existing feedback allowance', async () => {
  const response = await proxy(
    request({
      method: 'POST',
      path: '/api/v1/product-feedback',
      body: Buffer.alloc(700000),
    })
  );
  expect(response.headers.get('x-middleware-next')).toBe('1');
});

it.each(kinds)(
  'rejects a reused %s ticket without another Storage write',
  async (kind) => {
    const signed = ticket(kind);
    const body = await image(MAX_PAYLOAD_SIZE + 1);
    expect(
      (await dispatch(request({ kind, body, token: signed.token }), kind))
        .status
    ).toBe(200);
    expect(
      (await dispatch(request({ kind, body, token: signed.token }), kind))
        .status
    ).toBe(409);
    expect(f.budget).toHaveBeenCalledTimes(2);
    expect(f.upload).toHaveBeenCalledTimes(1);
  }
);

it('does not bypass the earlier API cost guard for a profile upload', async () => {
  f.cost.mockResolvedValue(
    NextResponse.json({ message: 'Limit reached' }, { status: 429 })
  );
  const response = await dispatch(request({ body: await image() }), 'avatar');
  expect(response.status).toBe(429);
  expect(f.budget).not.toHaveBeenCalled();
  expect(f.upload).not.toHaveBeenCalled();
});

it.each(kinds)(
  'rejects overstated %s Content-Length before consuming the ticket',
  async (kind) => {
    const response = await dispatch(
      request({
        kind,
        body: await image(),
        length: String(PROFILE_MEDIA_MAX_BYTES[kind] + 1),
      }),
      kind
    );
    expect(response.status).toBe(413);
    expect(f.budget).not.toHaveBeenCalled();
    expect(f.upload).not.toHaveBeenCalled();
  }
);

it.each(['-1', 'invalid', '12junk', '1.5'])(
  'retains strict upload Content-Length validation for %s',
  async (length) => {
    const response = await dispatch(
      request({ body: await image(), length }),
      'avatar'
    );
    expect(response.status).toBe(413);
    expect(f.upload).not.toHaveBeenCalled();
  }
);

it.each(kinds)(
  'authenticates the %s capability after admitting bytes above the generic cap',
  async (kind) => {
    const response = await dispatch(
      request({
        kind,
        body: await image(MAX_PAYLOAD_SIZE + 1),
        token: `${ticket(kind).token}tampered`,
      }),
      kind
    );
    expect(response.status).toBe(401);
    expect(f.budget).not.toHaveBeenCalled();
    expect(f.upload).not.toHaveBeenCalled();
  }
);
