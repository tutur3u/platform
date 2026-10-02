// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock('@tuturuuu/storage-core/security-budget', () => ({
  isSecurityEgressEnforcementEnabled: () => false,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: async () => ({
    storage: { from: () => ({ download: mocks.download }) },
  }),
}));
vi.mock('@/legacy-api-routes/v1/storage/reserved-path', () => ({
  rejectReservedStoragePath: () => null,
}));
vi.mock('@/lib/api-middleware', () => ({
  withApiAuth: (handler: unknown) => handler,
  createErrorResponse: (
    _title: string,
    message: string,
    status: number,
    code: string
  ) => NextResponse.json({ message, code }, { status }),
}));

import { GET } from './route';

beforeEach(() => {
  vi.stubEnv('STORAGE_DOWNLOADS_DISABLED', 'false');
  mocks.download.mockReset();
});
it.each([
  [
    { status: 404, message: 'Object not found: private details' },
    404,
    'File not found',
  ],
  [
    { status: 503, message: 'private upstream details' },
    500,
    'Failed to download file',
  ],
  [null, 500, 'Failed to download file'],
])(
  'preserves compatibility-path error classification without leaking upstream details',
  async (error, status, message) => {
    mocks.download.mockResolvedValue({ data: null, error });
    const response = await GET(
      new NextRequest('https://example.test/api/v1/storage/download/file.zip'),
      {
        params: Promise.resolve({ path: ['file.zip'] }),
        context: { wsId: 'ws-1' },
      } as never
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ message });
  }
);
