import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { RequiredMfaEnrollment } from './required-mfa-enrollment';

const mocks = vi.hoisted(() => ({
  listFactors: vi.fn(),
  enroll: vi.fn(),
  verify: vi.fn(),
  getUser: vi.fn(),
  getClaims: vi.fn(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mocks.getUser,
      getClaims: mocks.getClaims,
      mfa: {
        listFactors: mocks.listFactors,
        enroll: mocks.enroll,
        challengeAndVerify: mocks.verify,
      },
    },
  }),
}));
function renderEnrollment(onVerified = vi.fn(async () => {})) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RequiredMfaEnrollment onVerified={onVerified}>
        <p>existing factor challenge</p>
      </RequiredMfaEnrollment>
    </QueryClientProvider>
  );
  return onVerified;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'actor', app_metadata: {} } },
    error: null,
  });
  mocks.getClaims.mockResolvedValue({
    data: { claims: { sub: 'actor' } },
    error: null,
  });
  mocks.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
  mocks.enroll.mockResolvedValue({
    data: { id: 'factor', totp: { secret: 'LOCAL_TEST_SECRET' } },
    error: null,
  });
  mocks.verify.mockResolvedValue({ data: {}, error: null });
});
it('enrolls a factorless account and navigates only after verified OTP', async () => {
  const onVerified = renderEnrollment();
  fireEvent.click(
    await screen.findByRole('button', { name: 'required_mfa_start' })
  );
  expect(await screen.findByText('LOCAL_TEST_SECRET')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('verification_code_label'), {
    target: { value: '123456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'required_mfa_verify' }));
  await waitFor(() => expect(onVerified).toHaveBeenCalledOnce());
  expect(mocks.verify).toHaveBeenCalledWith({
    factorId: 'factor',
    code: '123456',
  });
});
it('retains the enrollment surface when verification fails', async () => {
  mocks.verify.mockResolvedValue({ error: new Error('Invalid code') });
  const onVerified = renderEnrollment();
  fireEvent.click(
    await screen.findByRole('button', { name: 'required_mfa_start' })
  );
  await screen.findByText('LOCAL_TEST_SECRET');
  fireEvent.change(screen.getByLabelText('verification_code_label'), {
    target: { value: '123456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'required_mfa_verify' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(onVerified).not.toHaveBeenCalled();
});
it('uses the existing challenge for accounts with an enrolled factor', async () => {
  mocks.listFactors.mockResolvedValue({
    data: { totp: [{ id: 'existing', status: 'verified' }] },
    error: null,
  });
  renderEnrollment();
  expect(await screen.findByText('existing factor challenge')).toBeTruthy();
  expect(mocks.enroll).not.toHaveBeenCalled();
});

it('routes reset sessions through primary sign-in before enrollment', async () => {
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: 'actor',
        app_metadata: {
          tuturuuu_required_mfa: {
            required: true,
            verifiedAfter: 100,
            primaryVerifiedAfter: 100,
          },
        },
      },
    },
    error: null,
  });
  renderEnrollment();
  expect(
    await screen.findByRole('button', { name: 'required_mfa_sign_in_again' })
  ).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'required_mfa_start' })
  ).toBeNull();
});
