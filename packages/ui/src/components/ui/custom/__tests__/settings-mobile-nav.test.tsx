import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SettingsNavGroup } from '../satellite-settings-dialog-shell';
import { SettingsMobileNavList } from '../settings-mobile-nav';

function TestIcon({ className }: { className?: string }) {
  return <span className={className} />;
}

// Similar names and a name repeated across groups guard against loose matches.
const navItems: SettingsNavGroup[] = [
  {
    label: 'Tasks',
    items: [
      { icon: TestIcon, label: 'General', name: 'general' },
      { icon: TestIcon, label: 'Board', name: 'board' },
      { icon: TestIcon, label: 'Board layout', name: 'board-layout' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { icon: TestIcon, label: 'General', name: 'general' },
      { icon: TestIcon, label: 'Board', name: 'board' },
    ],
  },
];

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= vi.fn();
});

function renderList(activeTab: string, onSelect = vi.fn()) {
  function Harness() {
    const [searchQuery, setSearchQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    return (
      <SettingsMobileNavList
        activeGroup={navItems[0]}
        activeTab={activeTab}
        labels={{
          description: 'Search',
          noResults: 'No results',
          searchPlaceholder: 'Search settings',
          title: 'Settings',
        }}
        navItems={
          searchQuery
            ? navItems
                .map((group) => ({
                  ...group,
                  items: group.items.filter((item) =>
                    item.label.toLowerCase().includes(searchQuery)
                  ),
                }))
                .filter((group) => group.items.length > 0)
            : navItems
        }
        onSearchChange={setSearchQuery}
        onSearchFocus={vi.fn()}
        onSelect={onSelect}
        searchInputRef={inputRef}
        searchQuery={searchQuery}
      />
    );
  }

  return render(<Harness />);
}

function highlighted() {
  return document.querySelectorAll('[cmdk-item][data-selected="true"]');
}

function current() {
  return document.querySelectorAll('[cmdk-item][aria-current="page"]');
}

describe('SettingsMobileNavList', () => {
  it('highlights only the current section by exact name in its own group', async () => {
    renderList('board');

    await waitFor(() => expect(highlighted()).toHaveLength(1));
    expect(current()).toHaveLength(1);
    expect(highlighted()[0]).toBe(current()[0]);
    expect(current()[0]).toHaveTextContent(/^Board$/);
    expect(screen.getAllByTestId('settings-mobile-current-check')).toHaveLength(
      1
    );
  });

  it('does not move the highlight on pointer movement', async () => {
    renderList('board');
    await waitFor(() => expect(highlighted()).toHaveLength(1));

    const [firstGeneral] = screen.getAllByRole('option', { name: 'General' });
    fireEvent.pointerMove(firstGeneral as HTMLElement);

    expect(highlighted()).toHaveLength(1);
    expect(highlighted()[0]).toBe(current()[0]);
  });

  it('returns the single highlight to the current section after clearing search', async () => {
    renderList('board');
    const input = screen.getByPlaceholderText('Search settings');

    fireEvent.change(input, { target: { value: 'general' } });
    await waitFor(() =>
      expect(highlighted()[0]).toHaveTextContent(/^General$/)
    );
    expect(highlighted()).toHaveLength(1);

    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => expect(highlighted()[0]).toBe(current()[0]));
    expect(highlighted()).toHaveLength(1);
  });

  it('selects a section on activation', () => {
    const onSelect = vi.fn();
    renderList('board', onSelect);

    fireEvent.click(screen.getByRole('option', { name: 'Board layout' }));
    expect(onSelect).toHaveBeenCalledWith('board-layout');
  });
});
