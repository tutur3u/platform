import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuContent } from '../dropdown-menu';
import { PublicProfileMenuItem } from './public-profile-menu-item';

function renderItem(onOpen?: () => void) {
  return render(
    <DropdownMenu open>
      <DropdownMenuContent>
        <PublicProfileMenuItem
          href="https://tuturuuu.com/u/creator"
          label="Profile"
          onOpen={onOpen}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

it('opens the profile in place instead of following a link', async () => {
  const onOpen = vi.fn();
  renderItem(onOpen);
  const item = screen.getByRole('menuitem', { name: 'Profile' });
  expect(item.getAttribute('href')).toBeNull();
  fireEvent.click(item);
  await waitFor(() => expect(onOpen).toHaveBeenCalledOnce());
});

it('links to the public page when no dialog can show it', () => {
  renderItem();
  expect(
    screen.getByRole('menuitem', { name: 'Profile' }).getAttribute('href')
  ).toBe('https://tuturuuu.com/u/creator');
});
