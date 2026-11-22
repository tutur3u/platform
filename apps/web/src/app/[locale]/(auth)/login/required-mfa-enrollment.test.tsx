// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { RequiredMfaEnrollment } from './required-mfa-enrollment';
import { groupSetupKey, setupQrValue } from './required-mfa-enrollment-parts';

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
  expect((await screen.findByTestId('required-mfa-secret')).textContent).toBe(
    'LOCA L_TE ST_S ECRE T'
  );
  fireEvent.change(await screen.findByLabelText('required_mfa_code_label'), {
    target: { value: '123456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'required_mfa_turn_on' }));
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
  await screen.findByTestId('required-mfa-secret');
  fireEvent.change(await screen.findByLabelText('required_mfa_code_label'), {
    target: { value: '123456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'required_mfa_turn_on' }));
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

it('draws the QR in the browser from the provider otpauth URI, with no network', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const uri =
    'otpauth://totp/Tuturuuu:actor?secret=LOCAL_TEST_SECRET&issuer=Tuturuuu';
  mocks.enroll.mockResolvedValue({
    data: { id: 'factor', totp: { secret: 'LOCAL_TEST_SECRET', uri } },
    error: null,
  });
  renderEnrollment();
  fireEvent.click(
    await screen.findByRole('button', { name: 'required_mfa_start' })
  );
  const qr = await screen.findByTestId('required-mfa-qr');
  expect(qr).toHaveAttribute('aria-label', 'required_mfa_qr_label');
  const svg = qr.querySelector('svg');
  expect(svg).toBeTruthy();
  expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
  expect(qr.querySelector('img')).toBeNull();
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(
    screen.getByRole('img', { name: 'required_mfa_step' })
  ).toBeInTheDocument();
  fetchSpy.mockRestore();
});

it('builds a TOTP URI from a bare secret and copies only the raw key', async () => {
  const writeText = vi.fn(async () => {});
  Object.assign(navigator, { clipboard: { writeText } });
  expect(setupQrValue({ secret: 'ABCD EFGH' })).toBe(
    'otpauth://totp/Tuturuuu?issuer=Tuturuuu&secret=ABCD+EFGH'
  );
  expect(setupQrValue({ secret: 'S', uri: 'https://qr.example/?d=S' })).toMatch(
    /^otpauth:\/\/totp\//u
  );
  expect(groupSetupKey('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
  renderEnrollment();
  fireEvent.click(
    await screen.findByRole('button', { name: 'required_mfa_start' })
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'required_mfa_copy_key' })
  );
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith('LOCAL_TEST_SECRET')
  );
  expect(
    await screen.findByRole('button', { name: 'required_mfa_key_copied' })
  ).toBeInTheDocument();
});
