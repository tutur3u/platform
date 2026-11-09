import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { Reauthenticate } from './reauthenticate';

const mocks = vi.hoisted(() => ({
  listFactors: vi.fn(),
  challengeAndVerify: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({ auth: { mfa: mocks } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../../login/required-mfa-enrollment', () => ({
  RequiredMfaEnrollment: ({ children }: { children: React.ReactNode }) =>
    children,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.listFactors.mockResolvedValue({
    data: { totp: [{ id: 'current-factor', status: 'verified' }] },
    error: null,
  });
  mocks.challengeAndVerify.mockResolvedValue({ error: null });
});
function setup() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <Reauthenticate loginPath="/en/login" />
    </QueryClientProvider>
  );
}
it('uses the existing provider MFA service and refreshes server authorization after verification', async () => {
  setup();
  expect(
    screen.getByRole('button', { name: 'required_mfa_verify' })
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText('verification_code_label'), {
    target: { value: '123456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'required_mfa_verify' }));
  await waitFor(() =>
    expect(mocks.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'current-factor',
      code: '123456',
    })
  );
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});
it('shows an accessible failure and keeps the user on the page on rejected MFA', async () => {
  mocks.challengeAndVerify.mockResolvedValue({ error: Error('rejected') });
  setup();
  fireEvent.change(screen.getByLabelText('verification_code_label'), {
    target: { value: '123456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'required_mfa_verify' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'required_mfa_error'
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
});
