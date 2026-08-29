// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { TutoringSessionRecord } from '@tuturuuu/internal-api';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateTutoringMessagePreview = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  generateTutoringMessagePreview: (...args: unknown[]) =>
    generateTutoringMessagePreview(...args) as unknown,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { TutoringParentMessageDialog } from './tutoring-parent-message-dialog';

function session(id: string, name: string) {
  return {
    id,
    student: {
      display_name: null,
      email: null,
      full_name: name,
      id: `student-${id}`,
    },
  } as TutoringSessionRecord;
}

function withQueryClient(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('TutoringParentMessageDialog', () => {
  beforeEach(() => {
    generateTutoringMessagePreview.mockReset();
  });

  it('renders the preview for the open session', async () => {
    generateTutoringMessagePreview.mockResolvedValue({
      preview: 'Xin chào phụ huynh Mai',
    });

    render(
      withQueryClient(
        <TutoringParentMessageDialog
          onOpenChange={vi.fn()}
          session={session('a', 'Mai')}
          wsId="ws-1"
        />
      )
    );

    expect(
      await screen.findByText('Xin chào phụ huynh Mai')
    ).toBeInTheDocument();
  });

  it('never shows a slow preview that belongs to a previously opened session', async () => {
    // Session A resolves only after session B has already been opened, which is
    // exactly the ordering that let a mutation write another learner's message
    // into the dialog.
    let resolveA: (value: { preview: string }) => void = () => undefined;
    generateTutoringMessagePreview.mockImplementation(
      (_wsId: string, sessionId: string) =>
        sessionId === 'a'
          ? new Promise<{ preview: string }>((resolve) => {
              resolveA = resolve;
            })
          : Promise.resolve({ preview: 'Message for Binh' })
    );

    const { rerender } = render(
      withQueryClient(
        <TutoringParentMessageDialog
          onOpenChange={vi.fn()}
          session={session('a', 'Mai')}
          wsId="ws-1"
        />
      )
    );

    rerender(
      withQueryClient(
        <TutoringParentMessageDialog
          onOpenChange={vi.fn()}
          session={session('b', 'Binh')}
          wsId="ws-1"
        />
      )
    );

    resolveA({ preview: 'Message for Mai' });

    expect(await screen.findByText('Message for Binh')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText('Message for Mai')).not.toBeInTheDocument()
    );
  });
});
