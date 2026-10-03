import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryMergeDialog } from './inventory-merge-dialog';

const state = vi.hoisted(() => ({
  data: undefined as unknown,
  fetching: false,
  previewError: false,
  labelError: false,
  labelsPending: false,
  refetch: vi.fn(),
  labelRefetch: vi.fn(),
  mutationError: false,
  mutate: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: state.data,
    isFetching: state.fetching,
    isError: state.previewError,
    refetch: state.refetch,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({
    mutate: state.mutate,
    reset: vi.fn(),
    isPending: false,
    isError: state.mutationError,
  }),
}));
vi.mock('@tuturuuu/internal-api/inventory', () => ({
  applyInventoryMerge: vi.fn(),
  previewInventoryMerge: vi.fn(),
}));
vi.mock('./inventory-merge-product-options', () => ({
  InventoryMergeProductSelect: ({
    value,
    excludeId,
    onChange,
  }: {
    value: string;
    excludeId: string;
    onChange: (value: string) => void;
  }) => (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Choose</option>
      {[
        { id: 'a', name: 'First' },
        { id: 'b', name: 'Second' },
      ]
        .filter((row) => row.id !== excludeId)
        .map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
    </select>
  ),
  useInventoryMergeProductLabels: () => ({
    data:
      state.labelsPending || state.labelError
        ? undefined
        : [{ id: 'a', name: 'Named product' }],
    isError: state.labelError,
    refetch: state.labelRefetch,
  }),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    `${key}${values ? JSON.stringify(values) : ''}`,
}));
vi.mock('@tuturuuu/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
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
vi.mock('@tuturuuu/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
    disabled,
  }: {
    children: ReactNode;
    value: string;
    onValueChange: (value: string) => void;
    disabled: boolean;
  }) => (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => <option value="">Choose</option>,
  SelectValue: () => null,
}));
vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: ({
    selected,
    options,
    onChange,
  }: {
    selected: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
  }) => (
    <select value={selected} onChange={(event) => onChange(event.target.value)}>
      <option value="">Choose</option>
      {options.map((row) => (
        <option key={row.value} value={row.value}>
          {row.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock('@tuturuuu/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    disabled,
    onCheckedChange,
  }: {
    checked: boolean;
    disabled: boolean;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  ),
}));
const options = [
  { id: 'a', name: 'First' },
  { id: 'b', name: 'Second' },
];
const preview = {
  version: 'one',
  source: { id: 'a', name: 'First', metadata: {} },
  target: { id: 'b', name: 'Second', metadata: {} },
  stock: [
    {
      productId: 'a',
      warehouseId: 'w',
      unitId: 'u',
      sourceAmount: null,
      targetAmount: null,
      sourcePresent: true,
      targetPresent: false,
      sourcePrice: 1,
      sourceMinAmount: 1,
      targetMinAmount: 0,
      sourceRevenueShareBps: 500,
      targetRevenueShareBps: 0,
      sourceRevenueSharePartnerId: null,
      targetRevenueSharePartnerId: null,
      targetPrice: 0,
      conflict: true,
    },
  ],
  references: [],
  blockers: [] as string[],
};
function choosePair() {
  const selects = screen.getAllByRole('combobox');
  fireEvent.change(selects[0]!, { target: { value: 'a' } });
  fireEvent.change(selects[1]!, { target: { value: 'b' } });
}
afterEach(cleanup);
beforeEach(() => {
  state.data = preview;
  state.fetching = false;
  state.previewError = false;
  state.labelError = false;
  state.labelsPending = false;
  state.mutationError = false;
  state.refetch.mockClear();
  state.labelRefetch.mockClear();
  state.mutate.mockClear();
});
describe('Inventory merge safety controls', () => {
  it('excludes source from destinations, requires acknowledgement and resets it when policy changes', () => {
    render(
      <InventoryMergeDialog kind="product" options={options} wsId="workspace" />
    );
    choosePair();
    expect(screen.getAllByRole('combobox')[1]!.textContent).not.toContain(
      'First'
    );
    const submit = screen.getByRole('button', {
      name: 'confirm',
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(state.mutate).toHaveBeenCalledOnce();
    fireEvent.change(screen.getAllByRole('combobox')[2]!, {
      target: { value: 'source' },
    });
    expect(submit.disabled).toBe(true);
  });
  it('requires new acknowledgement when the server preview version changes', () => {
    const { rerender } = render(
      <InventoryMergeDialog kind="product" options={options} wsId="workspace" />
    );
    choosePair();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(
      (screen.getByRole('button', { name: 'confirm' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    state.data = { ...preview, version: 'two' };
    rerender(
      <InventoryMergeDialog kind="product" options={options} wsId="workspace" />
    );
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(
      false
    );
    expect(
      (screen.getByRole('button', { name: 'confirm' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it('distinguishes unlimited stock from absent stock', () => {
    render(
      <InventoryMergeDialog kind="product" options={options} wsId="workspace" />
    );
    choosePair();
    expect(screen.getByText(/amounts/).textContent).toContain('unlimited');
    expect(screen.getByText(/amounts/).textContent).toContain('absent');
  });
  it('blocks confirmation for issues or a refreshing preview', () => {
    state.data = { ...preview, blockers: ['Resolve quantities'] };
    const { rerender } = render(
      <InventoryMergeDialog
        kind="warehouse"
        options={options}
        wsId="workspace"
      />
    );
    choosePair();
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(
      true
    );
    expect(
      (screen.getByRole('button', { name: 'confirm' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    state.data = preview;
    state.fetching = true;
    rerender(
      <InventoryMergeDialog
        kind="warehouse"
        options={options}
        wsId="workspace"
      />
    );
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(
      true
    );
    expect(
      (screen.getByRole('button', { name: 'confirm' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it('shows warehouse stock product names and prevents acknowledgment while labels are missing', () => {
    const { rerender } = render(
      <InventoryMergeDialog
        kind="warehouse"
        options={options}
        wsId="workspace"
      />
    );
    choosePair();
    expect(screen.getByText(/stockIdentity/).textContent).toContain(
      'Named product'
    );
    expect(screen.getByText(/stockIdentity/).textContent).not.toContain(
      '"product":"a"'
    );
    state.labelsPending = true;
    rerender(
      <InventoryMergeDialog
        kind="warehouse"
        options={options}
        wsId="workspace"
      />
    );
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(
      true
    );
    state.labelsPending = false;
    state.labelError = true;
    rerender(
      <InventoryMergeDialog
        kind="warehouse"
        options={options}
        wsId="workspace"
      />
    );
    expect(screen.getByRole('alert').textContent).toContain('labelsError');
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    expect(state.labelRefetch).toHaveBeenCalledOnce();
    expect(
      (screen.getByRole('button', { name: 'confirm' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
  it('keeps failed preview review blocked and provides a retry', () => {
    state.previewError = true;
    render(
      <InventoryMergeDialog kind="product" options={options} wsId="workspace" />
    );
    choosePair();
    expect(screen.getByRole('alert').textContent).toContain('previewError');
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    expect(state.refetch).toHaveBeenCalledOnce();
    expect(
      (screen.getByRole('button', { name: 'confirm' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
  it('shows a persistent merge error in the review', () => {
    state.mutationError = true;
    render(
      <InventoryMergeDialog kind="product" options={options} wsId="workspace" />
    );
    choosePair();
    expect(screen.getByRole('alert').textContent).toBe('error');
  });
  it('does not acknowledge a preview with an unresolved source name', () => {
    state.data = { ...preview, source: { ...preview.source, name: null } };
    render(
      <InventoryMergeDialog kind="product" options={options} wsId="workspace" />
    );
    choosePair();
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(
      true
    );
    expect(screen.getByRole('alert').textContent).toContain('labelsError');
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});
