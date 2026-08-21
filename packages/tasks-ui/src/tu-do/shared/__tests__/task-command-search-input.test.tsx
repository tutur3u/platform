import { act, fireEvent, render, screen } from '@testing-library/react';
import { Command, CommandItem, CommandList } from '@tuturuuu/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  clearTaskCommandSearchOnEscape,
  TaskCommandSearchInput,
} from '../task-command-search-input';

function SearchMenu({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState('feature');

  return (
    <DropdownMenu open onOpenChange={onOpenChange}>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent
        onEscapeKeyDown={(event) =>
          clearTaskCommandSearchOnEscape(event, query, setQuery)
        }
      >
        <Command>
          <TaskCommandSearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search labels..."
          />
          <CommandList>
            <CommandItem>Feature</CommandItem>
          </CommandList>
        </Command>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HoverSearchMenu() {
  const [labelQuery, setLabelQuery] = useState('');
  const [projectQuery, setProjectQuery] = useState('');

  return (
    <DropdownMenu open>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Labels</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <Command>
              <TaskCommandSearchInput
                value={labelQuery}
                onValueChange={setLabelQuery}
                placeholder="Search hover labels..."
              />
              <CommandList>
                <CommandItem>Feature</CommandItem>
              </CommandList>
            </Command>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Projects</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <Command>
              <TaskCommandSearchInput
                value={projectQuery}
                onValueChange={setProjectQuery}
                placeholder="Search hover projects..."
              />
              <CommandList>
                <CommandItem>Platform</CommandItem>
              </CommandList>
            </Command>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PersistentSearchMenu() {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState('');

  return (
    <>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        Toggle submenu
      </button>
      <div data-state={open ? 'open' : 'closed'}>
        <Command>
          <TaskCommandSearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search persistent submenu..."
          />
        </Command>
        <button type="button">Choose item</button>
      </div>
    </>
  );
}

describe('TaskCommandSearchInput', () => {
  it('takes focus after a submenu expands from pointer hover', async () => {
    render(<HoverSearchMenu />);

    fireEvent.pointerMove(screen.getByText('Labels'), {
      pointerType: 'mouse',
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)));

    const search = await screen.findByPlaceholderText('Search hover labels...');
    await act(() => new Promise(requestAnimationFrame));

    expect(search).toHaveFocus();
  });

  it('stops reclaiming focus when the user interacts with submenu content', async () => {
    render(<PersistentSearchMenu />);

    const item = screen.getByRole('button', { name: 'Choose item' });
    fireEvent.pointerDown(item, { pointerType: 'mouse' });
    item.focus();
    await act(() => new Promise(requestAnimationFrame));
    await act(() => new Promise(requestAnimationFrame));

    expect(item).toHaveFocus();
  });

  it('moves focus reliably across repeated hover-expanded submenus', async () => {
    render(<HoverSearchMenu />);

    for (let iteration = 0; iteration < 3; iteration += 1) {
      fireEvent.pointerMove(screen.getByText('Labels'), {
        pointerType: 'mouse',
      });
      await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
      expect(
        await screen.findByPlaceholderText('Search hover labels...')
      ).toHaveFocus();

      fireEvent.pointerMove(screen.getByText('Projects'), {
        pointerType: 'mouse',
      });
      await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
      expect(
        await screen.findByPlaceholderText('Search hover projects...')
      ).toHaveFocus();
    }
  });

  it('refocuses a persistent submenu input whenever it reopens', async () => {
    render(<PersistentSearchMenu />);

    const toggle = screen.getByRole('button', { name: 'Toggle submenu' });
    const search = screen.getByPlaceholderText('Search persistent submenu...');
    expect(search).toHaveFocus();

    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle).toHaveFocus();

    fireEvent.click(toggle);
    await act(() => new Promise(requestAnimationFrame));

    // Radix may perform a focus handoff just after the submenu has mounted.
    // Keep this within the component's explicit 500 ms settling window so the
    // assertion does not depend on frame throughput under full-suite load.
    toggle.focus();
    expect(toggle).toHaveFocus();
    await act(() => new Promise(requestAnimationFrame));

    expect(search).toHaveFocus();
  });

  it('clears a query before Escape can dismiss its dropdown layer', () => {
    const onOpenChange = vi.fn();
    render(<SearchMenu onOpenChange={onOpenChange} />);

    const search = screen.getByPlaceholderText('Search labels...');
    expect(search).toHaveFocus();

    fireEvent.keyDown(search, { key: 'Escape' });

    expect(search).toHaveValue('');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
