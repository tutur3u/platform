import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ComponentProps, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesExportDropdown } from './sales-export-dropdown';

const mocks = vi.hoisted(() => ({
  exportInventorySales: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/inventory', () => ({
  exportInventorySales: (...args: unknown[]) =>
    mocks.exportInventorySales(...args),
}));

vi.mock('@tuturuuu/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button onClick={onClick} type="button">
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const PERIOD = {
  created_at: '2026-07-01T00:00:00.000Z',
  description: null,
  ends_at: '2026-07-31',
  id: 'period-1',
  name: 'Offkai 2026',
  product_ids: [],
  product_scope: 'all' as const,
  sale_count: 2,
  starts_at: '2026-07-01',
  status: 'active' as const,
  updated_at: '2026-07-01T00:00:00.000Z',
  ws_id: 'ws-1',
};

function renderDropdown(
  props: Partial<ComponentProps<typeof SalesExportDropdown>> = {}
) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <SalesExportDropdown canExport period={PERIOD} wsId="ws-1" {...props} />
      </QueryClientProvider>
    );
  });

  return { container, root };
}

describe('SalesExportDropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exportInventorySales.mockResolvedValue({
      blob: new Blob(['export']),
      contentType: 'text/csv',
      filename: 'sales.csv',
    });
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:sales-export'),
        revokeObjectURL: vi.fn(),
      })
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('hides the export control without export permission', () => {
    const { container, root } = renderDropdown({ canExport: false });

    expect(container.textContent).toBe('');
    act(() => root.unmount());
  });

  it('disables export until a named period is selected', () => {
    const { container, root } = renderDropdown({ period: undefined });
    const trigger = container.querySelector('button');

    expect(trigger?.disabled).toBe(true);
    expect(trigger?.getAttribute('aria-label')).toBe('namedPeriodRequired');
    act(() => root.unmount());
  });

  it('downloads CSV through the typed client and cleans up the object URL', async () => {
    const { container, root } = renderDropdown();
    const csvButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('csvDescription')
    );

    await act(async () => {
      csvButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.exportInventorySales).toHaveBeenCalledWith('ws-1', {
      format: 'csv',
      period_id: 'period-1',
    });
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:sales-export');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('success');
    act(() => root.unmount());
  });
});
