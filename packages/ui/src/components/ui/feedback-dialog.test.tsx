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

const submitReport = vi.fn();

vi.mock('@tuturuuu/internal-api/reports', () => ({
  createReportUploadUrls: vi.fn(),
  deleteReportUploadPaths: vi.fn(),
  submitReport: (...args: unknown[]) => submitReport(...args),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('browser-image-compression', () => ({ default: vi.fn() }));
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
  const client = new QueryClient();
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
  submitReport.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

  it('submits through the report backend and lists the receipt', async () => {
    submitReport.mockResolvedValue({
      success: true,
      message: 'ok',
      reportId: 'report-123',
      uploadedMedia: [],
    });
    renderDialog();

    const [product, type] = screen.getAllByTestId('select');
    fireEvent.change(product as HTMLElement, { target: { value: 'web' } });
    fireEvent.change(type as HTMLElement, { target: { value: 'bug' } });
    fireEvent.change(screen.getByPlaceholderText('suggestion-placeholder'), {
      target: { value: 'The sidebar flickers' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'submit-report' }));

    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));
    expect(submitReport.mock.calls[0]?.[0]).toMatchObject({
      product: 'web',
      type: 'bug',
      suggestion: 'The sidebar flickers',
      imagePaths: [],
    });
    expect(
      await screen.findByText(/feedback-dialog-receipt-id.*report-123/)
    ).toBeDefined();
  });

  it('shows the empty history state with a way back to the form', () => {
    renderDialog();

    fireEvent.click(
      screen.getAllByRole('button', {
        name: /feedback-dialog-history/,
      })[0] as HTMLElement
    );

    expect(screen.getByText('feedback-dialog-history-empty')).toBeDefined();
    fireEvent.click(
      screen
        .getAllByRole('button', { name: 'feedback-dialog-send' })
        .at(-1) as HTMLElement
    );
    expect(screen.getByRole('button', { name: 'submit-report' })).toBeDefined();
  });
});
