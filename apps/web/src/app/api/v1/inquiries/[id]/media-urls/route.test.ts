// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from './route';

const actor = '00000000-0000-4000-8000-000000008001';
const id = '00000000-0000-4000-8000-000000008002';
const state = vi.hoisted(() => ({ images: [] as string[], sign: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        context: unknown,
        params: unknown
      ) => unknown
    ) =>
    async (request: NextRequest) =>
      handler(
        request,
        { user: { id: '00000000-0000-4000-8000-000000008001' } },
        { id: '00000000-0000-4000-8000-000000008002' }
      ),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({
        data: {
          creator_id: '00000000-0000-4000-8000-000000008001',
          images: state.images,
        },
        error: null,
      }),
    };
    return {
      from: () => query,
      storage: { from: () => ({ createSignedUrl: state.sign }) },
    };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.sign.mockResolvedValue({
    data: { signedUrl: 'https://example.test/signed' },
    error: null,
  });
});
async function sign(path: string) {
  state.images = [path];
  const response = await POST(
    new NextRequest(`http://localhost/api/v1/inquiries/${id}/media-urls`, {
      method: 'POST',
      body: JSON.stringify({ mediaPaths: [path] }),
    }),
    { params: Promise.resolve({ id }) }
  );
  return response.json();
}
it.each(['%2e%2e', '%252e%252e', '..', '%2f..', '%5c..'])(
  'rejects unsafe stored path segment %s before signing',
  async (segment) => {
    const path = `${actor}/${segment}/foreign.png`;
    expect(await sign(path)).toEqual({ urls: {} });
    expect(state.sign).not.toHaveBeenCalled();
  }
);
it('encodes each segment for the signing transport', async () => {
  const path = `${actor}/café photo.png`;
  expect(await sign(path)).toEqual({
    urls: { [path]: 'https://example.test/signed' },
  });
  expect(state.sign).toHaveBeenCalledWith(
    `${actor}/caf%C3%A9%20photo.png`,
    300
  );
});
it('retains the inquiry-prefixed legacy fallback with encoded segments', async () => {
  state.sign.mockResolvedValueOnce({
    data: null,
    error: { message: 'missing' },
  });
  const path = `${id}/photo name.png`;
  await sign(path);
  expect(state.sign).toHaveBeenLastCalledWith(`${id}/photo%20name.png`, 300);
});
