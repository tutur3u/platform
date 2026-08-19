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
  const [query, setQuery] = useState('');

  return (
    <DropdownMenu open>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Labels</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <Command>
              <TaskCommandSearchInput
                value={query}
                onValueChange={setQuery}
                placeholder="Search hover labels..."
              />
              <CommandList>
                <CommandItem>Feature</CommandItem>
              </CommandList>
            </Command>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
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
