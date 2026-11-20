import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import { courseContactsLinks } from './course-contacts-links';
import { CourseMembersPanel } from './course-members-panel';

const api = vi.hoisted(() => ({
  listWorkspaceCourseMembers: vi.fn(),
  listWorkspaceUsers: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  ...api,
  addWorkspaceCourseMembers: vi.fn(),
  removeWorkspaceCourseMember: vi.fn(),
}));

beforeEach(() => {
  api.listWorkspaceUsers.mockResolvedValue({ data: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function renderRoster() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <CourseMembersPanel courseId="class-7" wsId="center" />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return client;
}

it('links the existing class and roster profiles and displays recorded roles', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', '');
  api.listWorkspaceCourseMembers.mockResolvedValue({
    data: [{ id: 'person', full_name: 'Alex Morgan', role: 'TEACHER' }],
  });
  renderRoster();

  const group = await screen.findByRole('link', {
    name: 'Open class in Contacts',
  });
  expect(group.getAttribute('href')).toBe(
    'https://contacts.tuturuuu.com/center/users/groups/class-7'
  );
  expect(
    screen.getByRole('link', { name: 'Alex Morgan' }).getAttribute('href')
  ).toBe('https://contacts.tuturuuu.com/center/users/database/person');
  expect(screen.getByText('Teacher')).toBeTruthy();
});

it('does not show a roster handoff when its access check fails', async () => {
  api.listWorkspaceCourseMembers.mockRejectedValue(new Error('Forbidden'));
  const client = renderRoster();

  await waitFor(() =>
    expect(
      client.getQueryState(['teach-course-members', 'center', 'class-7'])
        ?.status
    ).toBe('error')
  );
  expect(
    await screen.findByText('Could not load the class roster.')
  ).toBeTruthy();
  expect(
    screen.queryByRole('link', { name: 'Open class in Contacts' })
  ).toBeNull();
});

it('uses the active Contacts mount and preserves each identifier as one segment', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'contacts');
  const links = courseContactsLinks('ws/name', 'class#id');
  expect(links?.group).toBe(
    'https://tuturuuu.com/contacts/ws%2Fname/users/groups/class%23id'
  );
  expect(links?.profile('user?query')).toBe(
    'https://tuturuuu.com/contacts/ws%2Fname/users/database/user%3Fquery'
  );
});
