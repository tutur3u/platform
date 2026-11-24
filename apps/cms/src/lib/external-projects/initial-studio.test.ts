import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadInitialCmsStudio } from './initial-studio';

const mocks = vi.hoisted(() => ({
  getStudio: vi.fn(),
  headers: vi.fn(),
  withForwardedInternalApiAuth: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getWorkspaceExternalProjectStudio: (
    ...args: Parameters<typeof mocks.getStudio>
  ) => mocks.getStudio(...args),
  withForwardedInternalApiAuth: (
    ...args: Parameters<typeof mocks.withForwardedInternalApiAuth>
  ) => mocks.withForwardedInternalApiAuth(...args),
}));

vi.mock('next/headers', () => ({
  headers: () => mocks.headers(),
}));

describe('loadInitialCmsStudio', () => {
  const requestHeaders = new Headers({ cookie: 'tuturuuu_app_session=abc' });
  const forwardedOptions = { defaultHeaders: { 'x-forwarded': '1' } };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(requestHeaders);
    mocks.withForwardedInternalApiAuth.mockReturnValue(forwardedOptions);
  });

  it('reads the studio with the caller session and drops the API binding', async () => {
    mocks.getStudio.mockResolvedValue({
      binding: { enabled: true, settings: { secret: true } },
      collections: [{ id: 'c1' }],
      entries: [],
    });

    const studio = await loadInitialCmsStudio('ws-1');

    expect(mocks.withForwardedInternalApiAuth).toHaveBeenCalledWith(
      requestHeaders
    );
    expect(mocks.getStudio).toHaveBeenCalledWith('ws-1', forwardedOptions);
    expect(studio).toEqual({ collections: [{ id: 'c1' }], entries: [] });
    expect(studio).not.toHaveProperty('binding');
  });

  it('falls back to the client fetch when the API call fails', async () => {
    mocks.getStudio.mockRejectedValue(new Error('403 Forbidden'));

    await expect(loadInitialCmsStudio('ws-1')).resolves.toBeUndefined();
  });
});
