// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { SsoError } from '@tuturuuu/sso';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  consentIdentity: vi.fn(),
  csrfFor: vi.fn(() => 'csrf-token-1'),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'sealed' }) }),
  headers: async () => new Headers(),
}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/lib/sso/browser-state', () => ({
  cookieName: (handle: string) => `sso-${handle}`,
  csrfFor: mocks.csrfFor,
  handleSchema: {
    safeParse: (value: unknown) =>
      typeof value === 'string' && /^tx-[a-z0-9]+$/u.test(value)
        ? { data: value, success: true }
        : { success: false },
  },
  unseal: async () => ({ sealed: true }),
}));
vi.mock('@/lib/sso/config', () => ({
  configuration: () => ({ origin: 'https://tuturuuu.com' }),
  enabled: () => true,
}));
vi.mock('@/lib/sso/identity', () => ({
  consentIdentity: mocks.consentIdentity,
}));
vi.mock('@/lib/sso/store', () => ({ adminClient: async () => ({}) }));
vi.mock('./reauthenticate', () => ({
  Reauthenticate: ({ loginPath }: { loginPath: string }) => (
    <a data-testid="reauthenticate" href={loginPath}>
      reauthenticate
    </a>
  ),
}));

import ConsentPage from './page';

async function renderPage(search: { transaction?: string; denied?: string }) {
  render(
    await ConsentPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve(search),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consentIdentity.mockResolvedValue({
    actor: { email: 'person@example.com', id: 'user-1' },
    current: { name: 'Example LMS' },
  });
});

it('keeps the decision POST, its CSRF field and both decisions', async () => {
  await renderPage({ transaction: 'tx-abc123' });

  const allow = screen.getByRole('button', { name: 'approve' });
  const form = allow.closest('form');
  expect(form).toHaveAttribute('method', 'post');
  expect(form).toHaveAttribute(
    'action',
    '/api/v1/sso/transactions/tx-abc123/decision'
  );
  const csrf = form?.querySelector('input[name="csrf"]');
  expect(csrf).toHaveAttribute('type', 'hidden');
  expect(csrf).toHaveAttribute('value', 'csrf-token-1');
  expect(mocks.csrfFor).toHaveBeenCalledWith(
    { sealed: true },
    expect.objectContaining({ id: 'user-1' })
  );
  expect(form?.querySelector('input[name="locale"]')).toHaveAttribute(
    'value',
    'en'
  );
  expect(allow).toHaveAttribute('type', 'submit');
  expect(allow).toHaveAttribute('name', 'decision');
  expect(allow).toHaveAttribute('value', 'approve');
  const deny = screen.getByRole('button', { name: 'deny' });
  expect(deny.closest('form')).toBe(form);
  expect(deny).toHaveAttribute('value', 'deny');

  expect(
    screen.getByRole('heading', { level: 1, name: 'share_title:Example LMS' })
  ).toBeInTheDocument();
  expect(screen.getByText('signed_in_as:person@example.com')).toBeVisible();
  expect(screen.getByTestId('auth-illustration-consent')).toBeInTheDocument();
});

it('shows the denied state without a form', async () => {
  await renderPage({ denied: '1' });
  expect(
    screen.getByRole('heading', { level: 1, name: 'denied' })
  ).toBeInTheDocument();
  expect(document.querySelector('form')).toBeNull();
});

it('rejects a malformed transaction before reading identity', async () => {
  await expect(renderPage({ transaction: '../evil' })).rejects.toThrow(
    'NEXT_NOT_FOUND'
  );
  expect(mocks.consentIdentity).not.toHaveBeenCalled();
});

it('sends an MFA step-up to the reauthenticate card with the mfa=required login path', async () => {
  mocks.consentIdentity.mockRejectedValue(
    new SsoError({ code: 'mfa_required' })
  );
  await renderPage({ transaction: 'tx-abc123' });
  expect(screen.getByTestId('reauthenticate')).toHaveAttribute(
    'href',
    `/en/login?mfa=required&nextUrl=${encodeURIComponent('/en/sso/consent?transaction=tx-abc123')}`
  );
  expect(document.querySelector('form')).toBeNull();
});

it('asks for sign-in when the session cannot authorise the consent', async () => {
  mocks.consentIdentity.mockRejectedValue(new SsoError({ code: 'forbidden' }));
  await renderPage({ transaction: 'tx-abc123' });
  expect(screen.getByRole('link', { name: 'sign_in' })).toHaveAttribute(
    'href',
    expect.stringContaining('/en/login?mfa=required&nextUrl=')
  );
});

it('treats a changed session as denied', async () => {
  mocks.consentIdentity.mockRejectedValue(
    new SsoError({ code: 'session_changed' })
  );
  await renderPage({ transaction: 'tx-abc123' });
  expect(
    screen.getByRole('heading', { level: 1, name: 'denied' })
  ).toBeInTheDocument();
});
