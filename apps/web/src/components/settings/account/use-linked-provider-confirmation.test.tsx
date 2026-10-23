import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveLinkedProviderOutcome,
  useLinkedProviderConfirmation,
} from './use-linked-provider-confirmation';

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock('@tuturuuu/ui/hooks/use-toast', () => ({ toast: toastMock }));

const t = (key: string, values?: Record<string, string>) =>
  values?.provider ? `${key}:${values.provider}` : key;

function renderConfirmation(
  linkedProvider: string | undefined,
  fetchIdentities: () => Promise<{ identities: never[] }>
) {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    () =>
      useLinkedProviderConfirmation({
        fetchIdentities,
        getProviderName: (provider) => provider.toUpperCase(),
        linkedProvider,
        t,
      }),
    { wrapper }
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('linked provider confirmation', () => {
  it('only treats a provider present in identities as linked', () => {
    expect(
      resolveLinkedProviderOutcome('google', [{ provider: 'google' }])
    ).toBe('linked');
    expect(
      resolveLinkedProviderOutcome('google', [{ provider: 'github' }])
    ).toBe('unconfirmed');
    expect(resolveLinkedProviderOutcome('google', undefined)).toBe(
      'unconfirmed'
    );
  });

  it('shows success after a fresh read confirms the link', async () => {
    const fetchIdentities = vi.fn(async () => ({
      identities: [{ provider: 'google' }] as never[],
    }));
    renderConfirmation('google', fetchIdentities);

    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
    expect(fetchIdentities).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith({
      description: 'account-linked-success:GOOGLE',
      title: 'success',
    });
  });

  it('uses neutral wording when the callback param has no completed link', async () => {
    renderConfirmation('google', async () => ({ identities: [] }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
    expect(toastMock).toHaveBeenCalledWith({
      description: 'account-link-unconfirmed:GOOGLE',
      title: 'linked-accounts',
    });
  });

  it('uses neutral wording when identities cannot be read', async () => {
    renderConfirmation('google', async () => {
      throw new Error('network');
    });

    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
    expect(toastMock.mock.calls[0]?.[0].title).toBe('linked-accounts');
  });

  it('does nothing without a callback provider', async () => {
    const fetchIdentities = vi.fn(async () => ({ identities: [] }));
    renderConfirmation(undefined, fetchIdentities);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchIdentities).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });
});
