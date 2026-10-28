import { render, screen } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BOARD_FILTERS } from './board-filter-state';
import { BoardPeopleFilter } from './board-people-filter';

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${Object.values(values).join('/')}` : key,
}));

// The real menu portals out of the header; render its items inline.
vi.mock('@tuturuuu/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  DropdownMenuCheckboxItem: ({ children }: { children: React.ReactNode }) => (
    <div role="menuitemcheckbox">{children}</div>
  ),
}));

const people = ['An', 'Binh', 'Chi', 'Dung', 'Em', 'Giang'].map((name) => ({
  id: name,
  display_name: name,
  avatar_url: null,
  email: null,
  taskCount: 1,
}));

function renderInHeader() {
  return render(
    <div data-board-header>
      <BoardPeopleFilter
        filters={DEFAULT_BOARD_FILTERS}
        onFiltersChange={vi.fn()}
        people={people}
        unassignedCount={0}
      />
    </div>
  );
}

const pills = () =>
  screen
    .getAllByRole('button', { pressed: false })
    .map((button) => button.getAttribute('aria-label'));
const menuItems = () =>
  screen
    .queryAllByRole('menuitemcheckbox')
    .map((item) => item.querySelector('.truncate')?.textContent);

describe('BoardPeopleFilter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows five people and lists only the rest under More', () => {
    renderInHeader();
    expect(pills()).toEqual(['An', 'Binh', 'Chi', 'Dung', 'Em']);
    expect(menuItems()).toEqual(['Giang']);
    expect(
      screen.getByText('ws-task-boards.header.more_people:1')
    ).toBeInTheDocument();
  });

  it('shows two people in a narrow header and every other person under More', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(
          private readonly callback: (
            entries: { contentRect: { width: number } }[]
          ) => void
        ) {}
        observe() {
          this.callback([{ contentRect: { width: 300 } }]);
        }
        disconnect() {}
      }
    );
    renderInHeader();
    expect(pills()).toEqual(['An', 'Binh']);
    expect(menuItems()).toEqual(['Chi', 'Dung', 'Em', 'Giang']);
    expect(screen.getByText('+4')).toBeInTheDocument();
  });
});
