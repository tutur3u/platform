import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DriveBreadcrumbs from './breadcrumbs';
import { driveKindTint } from './drive-file-kind';
import { DriveFilterBar } from './drive-filter-bar';
import { DriveFileGrid } from './drive-grid-view';
import type { DriveItemActions } from './drive-item-menu';
import { DriveListView } from './drive-list-view';
import { DriveStorageCard } from './drive-storage-card';
import type { DriveSearchState } from './search-params';

const mocks = vi.hoisted(() => ({ analytics: vi.fn() }));

vi.mock('next-intl', () => ({
  useFormatter: () => ({ dateTime: () => 'date' }),
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock('./use-drive-queries', () => ({
  useWorkspaceStorageAnalyticsQuery: mocks.analytics,
}));

vi.mock('./drive-grid-thumbnail', () => ({ DriveGridThumbnail: () => null }));

const file = {
  id: 'f1',
  name: 'report.pdf',
  metadata: { size: 2048 },
} as StorageObject;
const folder = { name: 'Logos' } as StorageObject;

function actions(): DriveItemActions {
  return {
    canManage: true,
    onCopyPath: vi.fn(),
    onDelete: vi.fn(),
    onDownload: vi.fn(),
    onMove: vi.fn(),
    onOpen: vi.fn(),
    onRename: vi.fn(),
    onShare: vi.fn(),
  };
}

function collection(selected: StorageObject[] = []) {
  return {
    actions: actions(),
    files: [file],
    folders: [folder],
    isSelected: (item: StorageObject) => selected.includes(item),
    onNavigate: vi.fn(),
    onToggle: vi.fn(),
    path: '',
    wsId: 'ws-1',
  };
}

describe('DriveBreadcrumbs', () => {
  it('builds the trail on the shared breadcrumb', () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <DriveBreadcrumbs onNavigate={onNavigate} path="Logos/2026" />
    );
    const nav = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(nav).toHaveAttribute('data-slot', 'breadcrumb');
    expect(
      container.querySelectorAll('[data-slot="breadcrumb-separator"]')
    ).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'files' }));
    fireEvent.click(screen.getByRole('button', { name: 'Logos' }));
    expect(onNavigate.mock.calls).toEqual([[''], ['Logos']]);

    const heading = screen.getByRole('heading', { level: 1, name: '2026' });
    expect(within(heading).getByText('2026')).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(
      screen.queryByRole('button', { name: '2026' })
    ).not.toBeInTheDocument();
  });

  it('lists the ancestors phones hide behind the ellipsis', async () => {
    const onNavigate = vi.fn();
    render(<DriveBreadcrumbs onNavigate={onNavigate} path="Logos/2026/Q1" />);
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'breadcrumb_more' }),
      { button: 0, ctrlKey: false, pointerType: 'mouse' }
    );
    await screen.findByRole('menu');
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['files', 'Logos']);
    fireEvent.click(items[1]!);
    expect(onNavigate).toHaveBeenCalledWith('Logos');
  });

  it('truncates crumb labels inside the button so touch hit areas stay whole', () => {
    render(<DriveBreadcrumbs onNavigate={vi.fn()} path="Logos/2026" />);
    const crumb = screen.getByRole('button', { name: 'Logos' });
    expect(crumb.className).not.toMatch(/\b(truncate|overflow-hidden)\b/u);
    expect(within(crumb).getByText('Logos')).toHaveClass('truncate');
  });

  it('shows no ellipsis with a single parent', () => {
    render(<DriveBreadcrumbs onNavigate={vi.fn()} path="Logos" />);
    expect(
      screen.queryByRole('button', { name: 'breadcrumb_more' })
    ).not.toBeInTheDocument();
  });

  it('shows only the heading at the root', () => {
    const { container } = render(
      <DriveBreadcrumbs onNavigate={vi.fn()} path="" />
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'files' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="breadcrumb-separator"]')
    ).toBeNull();
  });
});

describe('DriveFileGrid', () => {
  it('renders each folder and file as a Card inside its list item', () => {
    render(<DriveFileGrid {...collection()} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    for (const item of items) {
      const card = item.firstElementChild;
      expect(card).toHaveAttribute('data-slot', 'card');
      expect(card?.className).not.toMatch(/shadow-elevation|rounded-2xl/u);
    }
  });

  it('keeps opening and selection on each card', () => {
    const props = collection();
    render(<DriveFileGrid {...props} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'actions.open_named:{"name":"Logos"}',
      })
    );
    expect(props.onNavigate).toHaveBeenCalledWith('Logos');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'actions.preview_named:{"name":"report.pdf"}',
      })
    );
    expect(props.actions.onOpen).toHaveBeenCalledWith(file);

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'selection.select_item:{"name":"report.pdf"}',
      })
    );
    expect(props.onToggle).toHaveBeenCalledWith(file, true);
  });

  it('rings the card of a selected item', () => {
    render(<DriveFileGrid {...collection([file])} />);
    const checkbox = screen.getByRole('checkbox', {
      name: 'selection.select_item:{"name":"report.pdf"}',
    });
    expect(checkbox).toHaveAttribute('data-state', 'checked');
    expect(checkbox.closest('[data-slot="card"]')?.className).toContain(
      'has-[[data-state=checked]]:ring-2'
    );
  });
});

describe('DriveListView', () => {
  it('wraps the table in a flush Card', () => {
    render(<DriveListView {...collection()} onSelectAll={vi.fn()} />);
    const card = screen.getByRole('table').closest('[data-slot="card"]');
    expect(card).not.toBeNull();
    expect(card?.className).toMatch(/(^|\s)p-0(\s|$)/u);
    expect(card?.className).toContain('overflow-hidden');
  });
});

describe('DriveStorageCard', () => {
  beforeEach(() => {
    mocks.analytics.mockReturnValue({
      data: { storageLimit: 100, totalSize: 10, usagePercentage: 10 },
      refetch: vi.fn(),
      status: 'success',
    });
  });

  it('is a labelled region on the shared Card', () => {
    render(<DriveStorageCard wsId="ws-1" />);
    const region = screen.getByRole('region', { name: 'storage.title' });
    expect(region).toHaveAttribute('data-slot', 'card');
    expect(region.className).not.toMatch(/shadow-elevation|rounded-2xl/u);
  });
});

describe('DriveFilterBar', () => {
  const searchState = {
    path: '',
    q: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
    type: 'pdf',
    view: 'grid',
  } as DriveSearchState;

  it('renders the type chips in a segmented track', () => {
    const onChange = vi.fn();
    render(<DriveFilterBar onChange={onChange} searchState={searchState} />);
    const track = screen.getByRole('radiogroup', {
      name: 'filters.type_label',
    });
    expect(track).toHaveAttribute('data-variant', 'default');
    // The track itself comes from Sorbet; classic keeps joined toggles.
    expect(track.className).not.toContain('bg-muted');

    const chips = within(track).getAllByRole('radio');
    for (const chip of chips) expect(chip.className).not.toContain('!');
    expect(
      within(track).getByRole('radio', { name: 'chips.pdf' })
    ).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(within(track).getByRole('radio', { name: 'chips.image' }));
    expect(onChange).toHaveBeenCalledWith({ type: 'image' });
  });

  it('keeps the sort trigger at the shared control height', () => {
    render(<DriveFilterBar onChange={vi.fn()} searchState={searchState} />);
    const trigger = screen.getByRole('combobox', {
      name: 'filters.sort_label',
    });
    expect(trigger.className).not.toMatch(/(^|\s)h-(?!9(\s|$))\d+/u);
  });
});

describe('driveKindTint', () => {
  const globals = readFileSync(
    resolve(__dirname, '../../../../../../../../packages/ui/src/globals.css'),
    'utf8'
  );
  const neutral = new Set([
    'bg-accent text-foreground',
    'bg-accent text-muted-foreground',
  ]);

  it('uses calm tints of defined hues or the neutral surface', () => {
    for (const [kind, tint] of Object.entries(driveKindTint)) {
      if (neutral.has(tint)) continue;
      const match = /^bg-dynamic-([a-z]+)\/10 text-dynamic-\1$/u.exec(tint);
      expect(match, `${kind}: ${tint}`).not.toBeNull();
      expect(globals).toContain(`--color-dynamic-${match?.[1]}:`);
    }
  });
});
