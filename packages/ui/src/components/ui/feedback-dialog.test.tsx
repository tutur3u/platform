import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportProblemDialogContent } from './report-problem-dialog-content';
import type { ReportProblemDialogProps } from './report-problem-model';

const submitProductFeedback = vi.fn();
const listProductFeedbackReceipts = vi.fn();
const resetWidget = vi.fn();
const imageCompression = vi.hoisted(() => vi.fn());

vi.mock('@tuturuuu/internal-api/product-feedback', () => ({
  submitProductFeedback: (...args: unknown[]) => submitProductFeedback(...args),
  listProductFeedbackReceipts: (...args: unknown[]) =>
    listProductFeedbackReceipts(...args),
}));
// The widget stands in for Cloudflare's challenge: a button solves it.
vi.mock('@marsidev/react-turnstile', async () => {
  const react = await import('react');
  return {
    Turnstile: react.forwardRef(function MockTurnstile(
      { onSuccess }: { onSuccess: (token: string) => void },
      ref: React.Ref<{ reset: () => void }>
    ) {
      react.useImperativeHandle(ref, () => ({ reset: resetWidget }));
      return (
        <button
          type="button"
          onClick={() => onSuccess(`token-${Math.random()}`)}
        >
          solve-challenge
        </button>
      );
    }),
  };
});
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('browser-image-compression', () => ({ default: imageCompression }));
// Radix Select needs pointer APIs jsdom lacks; a native select keeps the
// field wiring under test.
vi.mock('@tuturuuu/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: ReactNode;
  }) => (
    <select
      aria-label="select"
      data-testid="select"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

const t: ReportProblemDialogProps['t'] = (key, values) =>
  values ? `${key} ${JSON.stringify(values)}` : key;

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ReportProblemDialogContent open showTrigger={false} t={t} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((media: string) => ({
      matches: false,
      media,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key-fixture');
  submitProductFeedback.mockReset();
  listProductFeedbackReceipts.mockReset();
  resetWidget.mockReset();
  imageCompression.mockReset();
  imageCompression.mockImplementation(async (file: File) => file);
  listProductFeedbackReceipts.mockResolvedValue({
    items: [],
    nextCursor: null,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('feedback dialog', () => {
  it('renders the feedback form inside the shared dialog shell', () => {
    renderDialog();

    const nav = document.querySelector('[data-settings-pane="nav"]');
    expect(nav).not.toBeNull();
    expect(nav?.textContent).toContain('feedback-dialog-send');
    expect(nav?.textContent).toContain('feedback-dialog-history');
    expect(nav?.textContent).not.toContain('onboarding_guide');
    expect(screen.getByRole('button', { name: 'submit-report' })).toBeDefined();
  });

  function fillForm(text = 'The sidebar flickers') {
    const [product, type] = screen.getAllByTestId('select');
    fireEvent.change(product as HTMLElement, { target: { value: 'web' } });
    fireEvent.change(type as HTMLElement, { target: { value: 'bug' } });
    fireEvent.change(screen.getByPlaceholderText('suggestion-placeholder'), {
      target: { value: text },
    });
  }
  const submit = () =>
    screen.getByRole('button', { name: 'submit-report' }) as HTMLButtonElement;
  const solve = () =>
    fireEvent.click(screen.getByRole('button', { name: 'solve-challenge' }));

  it('keeps submit disabled until the challenge is solved', () => {
    renderDialog();
    fillForm();
    expect(submit().disabled).toBe(true);
    solve();
    expect(submit().disabled).toBe(false);
  });

  it('submits through the intake with a Turnstile token and an idempotency key, then lists the receipt', async () => {
    submitProductFeedback.mockResolvedValue({
      id: 'receipt-123',
      createdAt: '2026-11-24T05:00:00Z',
    });
    listProductFeedbackReceipts.mockResolvedValue({
      items: [
        {
          id: 'receipt-123',
          createdAt: '2026-11-24T05:00:00Z',
          title: 'Bug Report - Web Dashboard',
        },
      ],
      nextCursor: null,
    });
    renderDialog();
    fillForm();
    solve();
    fireEvent.click(submit());

    await waitFor(() => expect(submitProductFeedback).toHaveBeenCalledTimes(1));
    expect(submitProductFeedback.mock.calls[0]?.[0]).toMatchObject({
      title: 'Bug Report - Web Dashboard',
      body: 'The sidebar flickers',
      idempotencyKey: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      ),
      turnstileToken: expect.stringMatching(/^token-/),
    });
    expect(await screen.findByText('Bug Report - Web Dashboard')).toBeDefined();
    expect(
      screen.getByText(/feedback-dialog-receipt-id.*receipt-123/)
    ).toBeDefined();
    expect(resetWidget).toHaveBeenCalled();
  });

  it('reuses the key on a retry of the same submission and mints a new one after an edit', async () => {
    submitProductFeedback.mockRejectedValueOnce(new Error('offline'));
    submitProductFeedback.mockRejectedValueOnce(new Error('offline'));
    submitProductFeedback.mockResolvedValue({
      id: 'r',
      createdAt: '2026-11-24T05:00:00Z',
    });
    renderDialog();
    fillForm();
    solve();
    fireEvent.click(submit());
    await waitFor(() => expect(submitProductFeedback).toHaveBeenCalledTimes(1));
    // The failed attempt spent its token; the form waits for a new challenge.
    await waitFor(() => expect(resetWidget).toHaveBeenCalled());
    await waitFor(() => expect(submit().disabled).toBe(true));

    solve();
    fireEvent.click(submit());
    await waitFor(() => expect(submitProductFeedback).toHaveBeenCalledTimes(2));
    const [first, second] = submitProductFeedback.mock.calls.map(
      (call) => call[0] as { idempotencyKey: string; turnstileToken: string }
    );
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey);
    expect(second?.turnstileToken).not.toBe(first?.turnstileToken);
    await waitFor(() => expect(submit().disabled).toBe(true));

    fireEvent.change(screen.getByPlaceholderText('suggestion-placeholder'), {
      target: { value: 'An edited description' },
    });
    solve();
    fireEvent.click(submit());
    await waitFor(() => expect(submitProductFeedback).toHaveBeenCalledTimes(3));
    const third = submitProductFeedback.mock.calls[2]?.[0] as
      | { idempotencyKey: string }
      | undefined;
    expect(third?.idempotencyKey).not.toBe(first?.idempotencyKey);
  });

  it('sends one attached image as base64 media', async () => {
    submitProductFeedback.mockResolvedValue({
      id: 'r',
      createdAt: '2026-11-24T05:00:00Z',
    });
    const { container } = renderDialog();
    fillForm();
    fireEvent.change(
      container.ownerDocument.querySelector(
        'input[type="file"]'
      ) as HTMLElement,
      {
        target: {
          files: [new File(['abc'], 'shot.png', { type: 'image/png' })],
        },
      }
    );
    await waitFor(() =>
      expect(container.ownerDocument.querySelector('ul img')).not.toBeNull()
    );
    solve();
    fireEvent.click(submit());
    await waitFor(() => expect(submitProductFeedback).toHaveBeenCalledTimes(1));
    expect(submitProductFeedback.mock.calls[0]?.[0]).toMatchObject({
      media: { contentType: 'image/png', data: 'YWJj' },
    });
  });

  it('pages through the signed-in user receipts with the keyset cursor', async () => {
    listProductFeedbackReceipts
      .mockResolvedValueOnce({
        items: [
          { id: 'a', createdAt: '2026-11-24T05:00:00Z', title: 'First title' },
        ],
        nextCursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        items: [
          { id: 'b', createdAt: '2026-11-23T05:00:00Z', title: 'Second title' },
        ],
        nextCursor: null,
      });
    renderDialog();
    fireEvent.click(
      screen.getAllByRole('button', {
        name: /feedback-dialog-history/,
      })[0] as HTMLElement
    );
    expect(await screen.findByText('First title')).toBeDefined();
    fireEvent.click(
      screen.getByRole('button', { name: 'feedback-dialog-history-more' })
    );
    expect(await screen.findByText('Second title')).toBeDefined();
    expect(listProductFeedbackReceipts.mock.calls[1]?.[0]).toMatchObject({
      cursor: 'cursor-1',
    });
  });

  it('offers a retry when the receipts cannot be read', async () => {
    listProductFeedbackReceipts.mockRejectedValueOnce(new Error('offline'));
    renderDialog();
    fireEvent.click(
      screen.getAllByRole('button', {
        name: /feedback-dialog-history/,
      })[0] as HTMLElement
    );
    expect(
      await screen.findByText('feedback-dialog-history-error')
    ).toBeDefined();
  });

  it('shows the empty history state with a way back to the form', async () => {
    renderDialog();

    fireEvent.click(
      screen.getAllByRole('button', {
        name: /feedback-dialog-history/,
      })[0] as HTMLElement
    );

    expect(
      await screen.findByText('feedback-dialog-history-empty')
    ).toBeDefined();
    fireEvent.click(
      screen
        .getAllByRole('button', { name: 'feedback-dialog-send' })
        .at(-1) as HTMLElement
    );
    expect(screen.getByRole('button', { name: 'submit-report' })).toBeDefined();
  });
});
