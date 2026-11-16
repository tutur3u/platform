import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { TaskAssigneesMenu } from '../task-assignees-menu';

const searchPeople = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api/people', () => ({
  searchWorkspacePeople: searchPeople,
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/ui/dropdown-menu', () => ({
  DropdownMenuSub: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DropdownMenuSubContent: ({
    children,
    ...props
  }: React.ComponentProps<'div'>) => (
    <div onKeyDownCapture={props.onKeyDownCapture}>{children}</div>
  ),
}));
afterEach(cleanup);

it('keeps contact links outside assignee callbacks and numeric shortcuts', async () => {
  searchPeople.mockResolvedValue({
    data: [
      {
        kind: 'contact',
        id: 'guest-1',
        linkedUserId: 'outside-1',
        displayName: 'Guest Contact',
        email: 'guest@example.com',
        avatarUrl: null,
      },
      {
        kind: 'member',
        id: 'outside-1',
        displayName: 'Guest Outsider',
        email: 'guest@example.com',
        avatarUrl: null,
      },
    ],
  });
  const assign = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TaskAssigneesMenu
        workspaceId="ws-1"
        forceOpen
        taskAssignees={[]}
        availableMembers={[{ id: 'guest-1', display_name: 'Guest' }]}
        isLoading={false}
        onToggleAssignee={assign}
        onMenuItemSelect={(_event, action) => action()}
      />
    </QueryClientProvider>
  );
  const search = screen.getByPlaceholderText('Search members...');
  fireEvent.change(search, { target: { value: 'Guest' } });
  const contactLink = await screen.findByRole('link');
  expect(contactLink.getAttribute('href')).toMatch(
    /\/ws-1\/users\/database\/guest-1$/
  );
  expect(screen.queryByText('Guest Outsider')).not.toBeInTheDocument();
  fireEvent.click(contactLink);
  fireEvent.keyDown(search, { key: '2' });
  expect(assign).not.toHaveBeenCalled();
  fireEvent.keyDown(search, { key: '1' });
  expect(assign).toHaveBeenCalledExactlyOnceWith('guest-1');
});
