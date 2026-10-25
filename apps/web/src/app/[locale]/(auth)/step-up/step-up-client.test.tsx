import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StepUpClient } from './step-up-client';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  listFactors: vi.fn(),
  enroll: vi.fn(),
  challengeAndVerify: vi.fn(),
  refreshSession: vi.fn(),
  getClaims: vi.fn(),
  handoff: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/auth-browser', () => ({
  createAuthClient: () => ({ auth: { ...mocks, mfa: mocks } }),
}));
vi.mock('@tuturuuu/internal-api/auth', () => ({
  createCrossAppReturnUrlWithInternalApi: mocks.handoff,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'actor' } },
    error: null,
  });
  mocks.listFactors.mockResolvedValue({
    data: { totp: [{ id: 'factor', status: 'verified' }] },
    error: null,
  });
  mocks.challengeAndVerify.mockResolvedValue({ error: null });
  mocks.refreshSession.mockResolvedValue({ error: null });
  mocks.getClaims.mockResolvedValue({
    data: {
      claims: {
        sub: 'actor',
        aal: 'aal2',
        session_id: 'provider-session',
        amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
      },
    },
    error: null,
  });
  mocks.handoff.mockResolvedValue({ returnUrl: 'https://evil.test/' });
});
afterEach(cleanup);
const next = `https://passwords.tuturuuu.com/en/workspace?state=${'a'.repeat(43)}`;
function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <StepUpClient next={next} userId="actor" />
    </QueryClientProvider>
  );
  return queryClient;
}
async function verify() {
  fireEvent.change(await screen.findByLabelText('verification_code_label'), {
    target: { value: '123456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'required_mfa_verify' }));
}

describe('central Passwords MFA', () => {
  it('requires a successful provider challenge and session refresh before a new handoff', async () => {
    setup();
    await verify();
    await waitFor(() =>
      expect(mocks.handoff).toHaveBeenCalledWith({ returnUrl: next })
    );
    expect(mocks.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'factor',
      code: '123456',
    });
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(mocks.challengeAndVerify.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refreshSession.mock.invocationCallOrder[0]!
    );
    expect(mocks.refreshSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.handoff.mock.invocationCallOrder[0]!
    );
    // The response destination is untrusted until checked against the return path.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'required_mfa_error'
    );
    expect(screen.getByLabelText('verification_code_label')).toHaveValue('');
  });
  it.each(['challenge', 'refresh', 'claims', 'account-change'])(
    'does not hand off on %s failure',
    async (failure) => {
      if (failure === 'challenge')
        mocks.challengeAndVerify.mockResolvedValue({
          error: new Error('private upstream text'),
        });
      if (failure === 'refresh')
        mocks.refreshSession.mockResolvedValue({
          error: new Error('private upstream text'),
        });
      if (failure === 'claims')
        mocks.getClaims.mockResolvedValue({
          data: { claims: { sub: 'actor', aal: 'aal1', iat: Date.now() } },
          error: null,
        });
      setup();
      await screen.findByLabelText('verification_code_label');
      if (failure === 'account-change')
        mocks.getUser.mockResolvedValue({
          data: { user: { id: 'other' } },
          error: null,
        });
      await verify();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'required_mfa_error'
      );
      expect(screen.queryByText('private upstream text')).toBeNull();
      expect(mocks.handoff).not.toHaveBeenCalled();
    }
  );
  it('enrolls an account without factors and verifies it before requesting a handoff', async () => {
    mocks.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    mocks.enroll.mockResolvedValue({
      data: { id: 'new-factor', totp: { secret: 'PRIVATE-FIXTURE-SETUP-KEY' } },
      error: null,
    });
    const queryClient = setup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'required_mfa_start' })
    );
    expect(await screen.findByText('PRIVATE-FIXTURE-SETUP-KEY')).toBeVisible();
    expect(mocks.handoff).not.toHaveBeenCalled();
    await verify();
    await waitFor(() => expect(mocks.handoff).toHaveBeenCalledTimes(1));
    expect(mocks.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'new-factor',
      code: '123456',
    });
    expect(screen.queryByText('PRIVATE-FIXTURE-SETUP-KEY')).toBeNull();
    const cached = [
      ...queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
      ...queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.state.data),
    ];
    expect(JSON.stringify(cached)).not.toContain('PRIVATE-FIXTURE-SETUP-KEY');
  });
  it('keeps a failed enrollment visible as a generic error with a retry control', async () => {
    mocks.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    mocks.enroll.mockResolvedValue({
      error: new Error('private upstream text'),
    });
    setup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'required_mfa_start' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'required_mfa_error'
    );
    expect(
      screen.getByRole('button', { name: 'required_mfa_start' })
    ).toBeEnabled();
    expect(mocks.handoff).not.toHaveBeenCalled();
  });
});
