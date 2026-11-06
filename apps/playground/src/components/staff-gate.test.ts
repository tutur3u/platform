import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPlaygroundAccess: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({
      'x-forwarded-host': 'playground.test',
      'x-forwarded-proto': 'https',
    }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => mocks.redirect(url),
}));
vi.mock('@/lib/staff-access', () => ({
  getPlaygroundAccess: () => mocks.getPlaygroundAccess(),
}));

const { StaffGate } = await import('./staff-gate');

describe('StaffGate', () => {
  beforeEach(() => {
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://web.contract.test');
    mocks.getPlaygroundAccess.mockReset();
    mocks.redirect.mockClear();
  });

  it('redirects a signed-out visitor to sign-in', async () => {
    mocks.getPlaygroundAccess.mockResolvedValue({ ok: false, status: 401 });

    await expect(StaffGate({ children: 'page' })).rejects.toThrow(
      /REDIRECT:https:\/\/web\.contract\.test\/login\?returnUrl=/
    );
  });

  it('sends a signed-in non-staff account to the web app without rendering the page', async () => {
    mocks.getPlaygroundAccess.mockResolvedValue({ ok: false, status: 403 });

    await expect(StaffGate({ children: 'page' })).rejects.toThrow(
      'REDIRECT:https://web.contract.test'
    );
  });

  it('renders the page for staff', async () => {
    mocks.getPlaygroundAccess.mockResolvedValue({ ok: true, userId: 'u' });

    await expect(StaffGate({ children: 'page' })).resolves.toBe('page');
  });
});
