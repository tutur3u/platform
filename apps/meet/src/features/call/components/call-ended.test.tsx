// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en.json';

vi.mock('next/link', () => ({
  default: ({
    onClick,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    />
  ),
}));
vi.mock('@/features/meeting-ai/meeting-ai-overview', () => ({
  MeetingAiOverview: () => null,
}));
vi.mock('@/features/meeting-ai/notes-sharing-control', () => ({
  NotesSharingControl: () => null,
}));
vi.mock('./ended-meeting-settings', () => ({
  EndedMeetingSettings: () => null,
}));

import { CallEnded } from './call-ended';

afterEach(cleanup);

it('refreshes stale personal and workspace meeting caches when returning from a call', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  let meetings = ['old meeting'];
  const keys = [
    ['meetings', 'personal', 1],
    ['meetings', 'workspace-id', 1],
  ];
  for (const queryKey of keys)
    await client.fetchQuery({ queryKey, queryFn: async () => meetings });
  client.setQueryData(['meet-room-state', 'meeting-id'], { ended: false });
  meetings = ['new meeting', 'old meeting'];
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <CallEnded
          canManage={false}
          canReadNotes={false}
          wsId="workspace-id"
          meetingId="meeting-id"
          meetingName="Test"
          backHref="/personal/meetings"
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole('link', { name: 'Back to Meet' }));
  await waitFor(() => {
    for (const key of keys)
      expect(client.getQueryData(key)).toEqual(['new meeting', 'old meeting']);
  });
  expect(
    client.getQueryState(['meet-room-state', 'meeting-id'])?.isInvalidated
  ).toBe(true);
  client.clear();
});
