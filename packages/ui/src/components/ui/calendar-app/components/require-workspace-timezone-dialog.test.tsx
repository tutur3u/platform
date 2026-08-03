import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireWorkspaceTimezoneDialog } from './require-workspace-timezone-dialog';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}));

vi.mock('../../dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('../../sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RequireWorkspaceTimezoneDialog
        onCompleted={vi.fn()}
        wsId="workspace-1"
      />
    </QueryClientProvider>
  );
}

describe('RequireWorkspaceTimezoneDialog E2EE initialization', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith('/calendar-settings')) {
          return Response.json({
            first_day_of_week: 'monday',
            timezone: 'UTC',
          });
        }

        if (url.endsWith('/encryption') && init?.method === 'POST') {
          return Response.json({ error: 'temporary failure' }, { status: 500 });
        }

        if (url.endsWith('/encryption')) {
          return Response.json({ enabled: true, hasKey: false });
        }

        throw new Error(`Unexpected request: ${url}`);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attempts once automatically and waits for an explicit retry', async () => {
    const view = renderDialog();

    await screen.findByRole('button', { name: 'common.retry' });

    const postCount = () =>
      vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST')
        .length;

    expect(postCount()).toBe(1);

    view.rerender(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              mutations: { retry: false },
              queries: { retry: false },
            },
          })
        }
      >
        <RequireWorkspaceTimezoneDialog
          onCompleted={vi.fn()}
          wsId="workspace-1"
        />
      </QueryClientProvider>
    );

    await waitFor(() => expect(postCount()).toBe(1));

    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));

    await waitFor(() => expect(postCount()).toBe(2));
  });
});
