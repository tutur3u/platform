import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletForm } from './form';

vi.mock('@tuturuuu/ui/hooks/use-workspace-currency', () => ({
  useWorkspaceCurrency: () => ({ currency: 'USD' }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('./walletId/wallet-role-access', () => ({
  default: () => null,
}));

vi.mock('./wallet-icon-image-picker', () => ({
  WalletIconImagePicker: () => null,
}));

function renderWalletForm() {
  const queryClient = new QueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <WalletForm
        wsId="ws-1"
        data={
          {
            balance: 1234,
            currency: 'USD',
            id: 'wallet-1',
            name: 'Primary',
            type: 'STANDARD',
          } as never
        }
      />
    </QueryClientProvider>
  );
}

describe('WalletForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/suspicious/noDocumentCookie: test resets the finance visibility cookie.
    document.cookie =
      'finance-confidential-mode=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
  });

  it('masks the disabled balance field when finance numbers are globally hidden', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=true;path=/';

    renderWalletForm();

    expect(
      screen.getByLabelText('wallet-data-table.wallet_balance')
    ).toHaveValue('•••••');
  });

  it('shows the disabled balance field when finance numbers are globally visible', async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=false;path=/';

    renderWalletForm();

    await waitFor(() =>
      expect(
        screen.getByLabelText('wallet-data-table.wallet_balance')
      ).toHaveValue('1,234')
    );
  });
});
