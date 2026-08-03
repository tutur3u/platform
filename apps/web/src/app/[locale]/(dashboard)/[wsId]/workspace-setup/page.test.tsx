import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  createCrossAppReturnUrlWithInternalApi: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw { href };
  }),
  withForwardedInternalApiAuth: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  withForwardedInternalApiAuth: (...args: unknown[]) =>
    mocks.withForwardedInternalApiAuth(...args),
}));

vi.mock('@tuturuuu/internal-api/auth', () => ({
  createCrossAppReturnUrlWithInternalApi: (...args: unknown[]) =>
    mocks.createCrossAppReturnUrlWithInternalApi(...args),
}));

vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import WorkspaceSetupPage from './page';

function renderPage(returnUrl?: string) {
  return WorkspaceSetupPage({
    params: Promise.resolve({ locale: 'en', wsId: 'workspace-1' }),
    searchParams: Promise.resolve({ returnUrl }),
  });
}

describe('WorkspaceSetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ cookie: 'session=1' }));
    mocks.withForwardedInternalApiAuth.mockReturnValue({ auth: 'forwarded' });
    mocks.createCrossAppReturnUrlWithInternalApi.mockResolvedValue({
      returnUrl:
        'https://tasks.tuturuuu.com/verify-token?nextUrl=%2Fen%2Fworkspace-1%2Ftasks&token=signed',
      targetApp: 'tasks',
    });
  });

  it('returns through the tokenized satellite verifier URL', async () => {
    await expect(
      renderPage('https://tasks.tuturuuu.com/en/workspace-1/tasks')
    ).rejects.toMatchObject({
      href: 'https://tasks.tuturuuu.com/verify-token?nextUrl=%2Fen%2Fworkspace-1%2Ftasks&token=signed',
    });

    expect(mocks.createCrossAppReturnUrlWithInternalApi).toHaveBeenCalledWith(
      { returnUrl: 'https://tasks.tuturuuu.com/en/workspace-1/tasks' },
      { auth: 'forwarded' }
    );
  });

  it('falls back to the Platform workspace for an invalid return URL', async () => {
    await expect(
      renderPage('https://evil.example/workspace-1')
    ).rejects.toMatchObject({ href: '/en/workspace-1' });

    expect(mocks.createCrossAppReturnUrlWithInternalApi).not.toHaveBeenCalled();
  });

  it('renders safe retry actions when token generation fails', async () => {
    mocks.createCrossAppReturnUrlWithInternalApi.mockResolvedValue({
      error: 'Failed to generate token',
    });

    const markup = renderToStaticMarkup(
      await renderPage('https://tasks.tuturuuu.com/en/workspace-1/tasks')
    );

    expect(markup).toContain('return_failed_title');
    expect(markup).toContain('return_failed_description');
    expect(markup).toContain('/en/workspace-1/workspace-setup?returnUrl=');
    expect(markup).toContain('href="/en/workspace-1"');
    expect(markup).not.toContain('evil.example');
  });
});
