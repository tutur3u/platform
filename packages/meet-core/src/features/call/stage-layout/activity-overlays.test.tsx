// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ActivityDropdownMenu } from './activity-dropdown-menu';
import { ActivityPaneContext } from './activity-pane-context';
import { ActivitySelect } from './activity-select';

vi.mock('../prejoin/use-meet-call-ux', () => ({
  useMeetCallUx: () => true,
}));

afterEach(cleanup);

function pane(visible: boolean, children: ReactNode) {
  return (
    <ActivityPaneContext
      value={{
        activityId: 'document',
        title: 'Document',
        active: visible,
        visible,
        sizeClass: 'medium',
        short: false,
        maximized: false,
        headerSlot: null,
        toggleMaximize: () => {},
        close: () => {},
      }}
    >
      <div hidden={!visible} inert={!visible || undefined}>
        {children}
      </div>
    </ActivityPaneContext>
  );
}

it('closes the activity select when its pane is hidden', () => {
  const select = (
    <ActivitySelect defaultValue="one">
      <SelectTrigger aria-label="Choice">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="one">One</SelectItem>
      </SelectContent>
    </ActivitySelect>
  );
  const { rerender } = render(pane(true, select));
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Choice' }), {
    key: 'ArrowDown',
  });
  expect(screen.getByRole('option', { name: 'One' })).toBeTruthy();

  rerender(pane(false, select));
  expect(screen.queryByRole('listbox', { hidden: true })).toBeNull();

  rerender(pane(true, select));
  const trigger = screen.getByRole('combobox', { name: 'Choice' });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('listbox', { hidden: true })).toBeNull();
});

it('closes the activity dropdown when its pane is hidden', () => {
  const menu = (
    <ActivityDropdownMenu>
      <DropdownMenuTrigger>Document options</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Rename</DropdownMenuItem>
      </DropdownMenuContent>
    </ActivityDropdownMenu>
  );
  const { rerender } = render(pane(true, menu));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Document options' }), {
    key: 'Enter',
  });
  expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy();

  rerender(pane(false, menu));
  expect(screen.queryByRole('menu', { hidden: true })).toBeNull();

  rerender(pane(true, menu));
  expect(screen.queryByRole('menu', { hidden: true })).toBeNull();
});
