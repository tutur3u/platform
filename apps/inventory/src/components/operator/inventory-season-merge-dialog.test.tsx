import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventorySeasonMergeDialog } from './inventory-season-merge-dialog';

const state = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  paged: undefined as unknown,
  error: false,
  fetching: false,
  mutationError: false,
  refetch: vi.fn(),
  mutate: vi.fn(),
  queries: [] as { enabled: boolean }[],
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { enabled: boolean; queryKey: unknown[] }) => {
    state.queries.push(options);
    return {
      data:
        options.queryKey[2] === 'season-merge-page' ? state.paged : state.data,
      isError: state.error,
      isFetching: state.fetching,
      refetch: state.refetch,
    };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({
    mutate: state.mutate,
    reset: vi.fn(),
    isPending: false,
    isError: state.mutationError,
  }),
}));
vi.mock('@tuturuuu/internal-api/inventory', () => ({
  applyInventorySeasonMerge: vi.fn(),
  previewInventorySeasonMerge: vi.fn(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/dialog', () => ({
  Dialog: ({
    children,
    onOpenChange,
  }: {
    children: ReactNode;
    onOpenChange: (value: boolean) => void;
  }) => (
    <div
      onClick={(event) => {
        if ((event.target as HTMLElement).textContent === 'title')
          onOpenChange(true);
      }}
    >
      {children}
    </div>
  ),
  DialogTrigger: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./operator-dialog-shell', () => ({
  OperatorDialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  OperatorDialogHeader: () => null,
  OperatorDialogBody: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  OperatorDialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: ({
    ariaLabel,
    selected,
    onChange,
    options,
    disabled,
  }: {
    ariaLabel: string;
    selected: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    disabled: boolean;
  }) => (
    <select
      aria-label={ariaLabel}
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      <option value="">choose</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock('@tuturuuu/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
    disabled,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: ReactNode;
    disabled: boolean;
  }) => (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      disabled={disabled}
    >
      <option value="">choose</option>
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));
const period = {
  id: 'a',
  name: 'Source',
  description: null,
  starts_at: null,
  ends_at: null,
  pricing_mode: 'legacy' as const,
  time_zone: null,
  product_scope: 'all' as const,
  product_ids: [],
  sale_count: 0,
  status: 'active' as const,
  ws_id: 'ws',
  created_at: '',
};
const periods = [
  period,
  { ...period, id: 'b', name: 'Destination' },
  { ...period, id: 'alias', name: 'Old alias', merged_into_id: 'b' },
];
function open() {
  render(<InventorySeasonMergeDialog wsId="ws" periods={periods} />);
  fireEvent.click(screen.getByRole('button', { name: 'title' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'source' }), {
    target: { value: 'a' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'target' }), {
    target: { value: 'b' },
  });
}
function policies() {
  const selects = screen.getAllByRole('combobox');
  for (const select of selects.slice(2))
    fireEvent.change(select, { target: { value: 'target' } });
}
beforeEach(() => {
  vi.clearAllMocks();
  state.queries = [];
  state.error = false;
  state.fetching = false;
  state.mutationError = false;
  state.paged = undefined;
  state.data = {
    version: 'frozen',
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    cutoff: new Date().toISOString(),
    page: 1,
    source: period,
    target: periods[1],
    sourceRules: [],
    targetRules: [],
    sourceRuleCount: 0,
    targetRuleCount: 0,
    sourceRuleConflictCount: 0,
    targetRuleConflictCount: 0,
    futurePrices: [],
    futurePriceCount: 0,
    conflicts: [],
    conflictCount: 0,
    blockers: [],
    hasMore: false,
    assignmentCount: 4,
    historicalQuoteCount: 2,
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('bounded season merge review', () => {
  it('does not mount queries while closed and excludes permanent aliases', () => {
    render(<InventorySeasonMergeDialog wsId="ws" periods={periods} />);
    expect(state.queries).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'title' }));
    expect(state.queries.every((q) => !q.enabled)).toBe(true);
    expect(screen.queryByText('Old alias')).toBeNull();
  });
  it('requires every policy and acknowledgment before applying', () => {
    open();
    expect(screen.getByRole('button', { name: 'confirm' })).toHaveProperty(
      'disabled',
      true
    );
    expect(screen.getByRole('checkbox')).toHaveProperty('disabled', true);
    policies();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'confirm' })).toHaveProperty(
      'disabled',
      false
    );
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    expect(state.mutate).toHaveBeenCalledOnce();
  });
  it('requires all bounded pages before acknowledgment', () => {
    state.data.hasMore = true;
    state.paged = { ...state.data, page: 2, hasMore: false };
    open();
    policies();
    expect(screen.getByRole('checkbox')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    expect(screen.getByRole('checkbox')).toHaveProperty('disabled', false);
    expect(screen.getByText('page')).not.toBeNull();
  });
  it('fails closed on error with actionable refresh', () => {
    state.error = true;
    open();
    policies();
    expect(screen.getByRole('checkbox')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it('requires refresh after apply errors rather than confirming old review again', () => {
    state.mutationError = true;
    open();
    policies();
    expect(screen.getByRole('checkbox')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'refresh' })).not.toBeNull();
  });
  it('expires acknowledgment and exposes refresh without changing fingerprint', () => {
    vi.useFakeTimers();
    open();
    policies();
    fireEvent.click(screen.getByRole('checkbox'));
    act(() => vi.advanceTimersByTime(300001));
    expect(screen.getByRole('button', { name: 'confirm' })).toHaveProperty(
      'disabled',
      true
    );
    expect(screen.getByText('expired')).not.toBeNull();
  });
  it.each(['blockers', 'targetRuleConflictCount'])(
    'blocks incompatible calendar or product rules (%s)',
    (key) => {
      state.data[key] = key === 'blockers' ? ['pricing_calendar_mismatch'] : 2;
      open();
      policies();
      expect(screen.getByRole('checkbox')).toHaveProperty('disabled', true);
      expect(screen.getByRole('button', { name: 'confirm' })).toHaveProperty(
        'disabled',
        true
      );
    }
  );
  it('refuses UUID-only or missing product names', () => {
    state.data.sourceRules = [{ id: 'uuid', name: '' }];
    open();
    policies();
    expect(screen.getByRole('checkbox')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'refresh' })).not.toBeNull();
  });
  it('explains priced mismatch versus unpriced calendar retention', () => {
    open();
    expect(screen.getByText('unpricedCalendar')).not.toBeNull();
    cleanup();
    state.data.futurePriceCount = 1;
    state.data.blockers = ['pricing_calendar_mismatch'];
    open();
    expect(screen.getByText('pricedCalendar')).not.toBeNull();
    expect(screen.getByText('calendarBlocked')).not.toBeNull();
  });
});
