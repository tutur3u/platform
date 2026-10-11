import type { ComponentProps, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { SatelliteUserMenuItems } from './satellite-user-menu-items';

vi.mock('@tuturuuu/ui/dropdown-menu', () => {
  const Container = ({ children }: { children: ReactNode }) => <>{children}</>;
  return Object.fromEntries(
    [
      'DropdownMenuGroup',
      'DropdownMenuItem',
      'DropdownMenuPortal',
      'DropdownMenuSeparator',
      'DropdownMenuSub',
      'DropdownMenuSubContent',
      'DropdownMenuSubTrigger',
    ].map((key) => [key, Container])
  );
});
const props: ComponentProps<typeof SatelliteUserMenuItems> = {
  centralUrl: 'https://tuturuuu.com',
  t: (key) => key,
  languageItems: null,
  themeItems: null,
  accountItems: null,
  signedIn: true,
  onReport: vi.fn(),
  onLogout: vi.fn(),
};
it('renders a labelled public profile link separately from private account settings', () => {
  const html = renderToStaticMarkup(
    <SatelliteUserMenuItems
      {...props}
      publicProfile={{
        href: 'https://tuturuuu.com/u/creator',
        label: 'Public profile',
      }}
    />
  );
  expect(html).toContain('href="https://tuturuuu.com/u/creator"');
  expect(html).toContain('Public profile');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain('common.dashboard');
});
it('does not invent a profile link for users without a username', () => {
  const html = renderToStaticMarkup(<SatelliteUserMenuItems {...props} />);
  expect(html).not.toContain('/u/');
});
it('does not expose a profile link in a signed-out menu even if an adapter supplies one', () => {
  const html = renderToStaticMarkup(
    <SatelliteUserMenuItems
      {...props}
      signedIn={false}
      publicProfile={{
        href: 'https://tuturuuu.com/u/creator',
        label: 'Public profile',
      }}
    />
  );
  expect(html).not.toContain('/u/creator');
});
