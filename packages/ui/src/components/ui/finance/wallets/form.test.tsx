import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WalletFormValues } from './form';
import { WalletForm } from './form';

const mocks = vi.hoisted(() => ({
  createWallet: vi.fn(),
  updateWallet: vi.fn(),
}));

vi.mock('@tuturuuu/ui/hooks/use-workspace-currency', () => ({
  useWorkspaceCurrency: (_wsId: string, fallbackCurrency = 'USD') => ({
    currency: fallbackCurrency,
  }),
}));

vi.mock('@tuturuuu/internal-api/finance', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/internal-api/finance')>();
  return {
    ...actual,
    createWallet: mocks.createWallet,
    updateWallet: mocks.updateWallet,
  };
});

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

function renderWalletForm(
  options: {
    data?: ComponentProps<typeof WalletForm>['data'];
    defaultType?: WalletFormValues['type'];
    defaultCurrency?: string;
  } = {}
) {
  const data =
    'data' in options
      ? options.data
      : ({
          balance: 1234,
          currency: 'USD',
          id: 'wallet-1',
          name: 'Primary',
          type: 'STANDARD',
        } as never);
  const { defaultCurrency, defaultType } = options;

  const queryClient = new QueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <WalletForm
        wsId="ws-1"
        data={data}
        defaultType={defaultType}
        defaultCurrency={defaultCurrency}
      />
    </QueryClientProvider>
  );
}

function typeIntoCurrencyInput(input: HTMLInputElement, value: string) {
  fireEvent.focus(input);

  for (const character of value) {
    const nextValue = `${input.value}${character}`;
    fireEvent.change(input, {
      target: {
        selectionStart: nextValue.length,
        value: nextValue,
      },
    });
  }
}

describe('WalletForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createWallet.mockResolvedValue({ message: 'success' });
    mocks.updateWallet.mockResolvedValue({ message: 'success' });
    // biome-ignore lint/suspicious/noDocumentCookie: test resets the finance visibility cookie.
    document.cookie =
      'finance-confidential-mode=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;Secure';
  });

  it('masks the disabled balance field when finance numbers are globally hidden', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=true;path=/;Secure';

    renderWalletForm();

    expect(
      screen.getByLabelText('wallet-data-table.wallet_balance')
    ).toHaveValue('•••••');
  });

  it('shows the disabled balance field when finance numbers are globally visible', async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=false;path=/;Secure';

    renderWalletForm();

    await waitFor(() =>
      expect(
        screen.getByLabelText('wallet-data-table.wallet_balance')
      ).toHaveValue('1,234')
    );
  });

  it('opens credit-card create flows with credit defaults', () => {
    renderWalletForm({
      data: undefined,
      defaultType: 'CREDIT',
    });

    expect(
      screen.getByText('wallet-data-table.wallet_type_credit_description')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('wallet-data-table.credit_limit')).toHaveValue(
      ''
    );
    expect(
      screen.getByLabelText('wallet-data-table.statement_date')
    ).toHaveValue(1);
    expect(screen.getByLabelText('wallet-data-table.payment_date')).toHaveValue(
      15
    );
  });

  it('initializes new wallet currency from the supplied workspace default', async () => {
    renderWalletForm({
      data: undefined,
      defaultCurrency: 'SGD',
    });

    fireEvent.change(screen.getByLabelText('wallet-data-table.wallet_name'), {
      target: { value: 'Singapore Cash' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ws-wallets.create' }));

    await waitFor(() =>
      expect(mocks.createWallet).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          currency: 'SGD',
          name: 'Singapore Cash',
          type: 'STANDARD',
        })
      )
    );
  });

  it('keeps accepting large credit limits after locale grouping is inserted', () => {
    renderWalletForm({
      data: {
        balance: 0,
        currency: 'VND',
        id: 'wallet-1',
        limit: undefined,
        name: 'Credit Wallet',
        payment_date: 25,
        statement_date: 10,
        type: 'CREDIT',
      } as never,
    });

    const creditLimitInput = screen.getByLabelText(
      'wallet-data-table.credit_limit'
    ) as HTMLInputElement;

    typeIntoCurrencyInput(creditLimitInput, '39999');

    expect(creditLimitInput).toHaveValue('39.999');
  });
});
