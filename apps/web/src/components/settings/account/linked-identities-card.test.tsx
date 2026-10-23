import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LinkedIdentitiesCard from './linked-identities-card';

type IdentitiesResponse = {
  canUnlink: boolean;
  identities: { id: string; provider: string }[];
};

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  replace: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/lib/api-fetch', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('@tuturuuu/ui/hooks/use-toast', () => ({ toast: mocks.toast }));
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/personal',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () =>
    new URLSearchParams(
      'settingsDialog=open&settingsTab=security&settingsLinkedProvider=google'
    ),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

/** Every identities request waits on one controllable response. */
function deferIdentities() {
  let resolve!: (value: IdentitiesResponse) => void;
  const response = new Promise<IdentitiesResponse>((done) => {
    resolve = done;
  });
  mocks.apiFetch.mockImplementation(() => response);
  return (value: IdentitiesResponse) => act(async () => resolve(value));
}

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LinkedIdentitiesCard linkedProvider="google" />
    </QueryClientProvider>
  );
}

function toastDescriptions() {
  return mocks.toast.mock.calls.map(([options]) => options?.description);
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('LinkedIdentitiesCard identity-link callback', () => {
  it('waits for identities, then uses neutral wording when nothing was linked', async () => {
    const respond = deferIdentities();
    renderCard();

    // The callback param is consumed and stripped, but no toast is shown yet.
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    expect(mocks.replace.mock.calls[0]?.[0]).toBe(
      '/en/personal?settingsDialog=open&settingsTab=security'
    );
    expect(mocks.toast).not.toHaveBeenCalled();

    await respond({ canUnlink: false, identities: [] });

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
    expect(toastDescriptions()).toEqual(['account-link-unconfirmed']);
  });

  it('shows success only once identities include the provider', async () => {
    const respond = deferIdentities();
    renderCard();

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalled());
    expect(mocks.toast).not.toHaveBeenCalled();

    await respond({
      canUnlink: true,
      identities: [{ id: 'identity-1', provider: 'google' }],
    });

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
    expect(toastDescriptions()).toEqual(['account-linked-success']);
  });
});
