// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { afterEach, expect, it } from 'vitest';
import { WorkbenchDropdown } from './workbench-dropdown';

afterEach(cleanup);

it('closes the workbench dropdown when suspended', () => {
  const view = (suspended: boolean) => (
    <WorkbenchDropdown suspended={suspended}>
      <DropdownMenuTrigger>Workbench options</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Share</DropdownMenuItem>
      </DropdownMenuContent>
    </WorkbenchDropdown>
  );
  const { rerender } = render(view(false));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Workbench options' }), {
    key: 'Enter',
  });
  expect(screen.getByRole('menuitem', { name: 'Share' })).toBeTruthy();

  rerender(view(true));
  expect(screen.queryByRole('menu', { hidden: true })).toBeNull();

  rerender(view(false));
  expect(screen.queryByRole('menu', { hidden: true })).toBeNull();
});
