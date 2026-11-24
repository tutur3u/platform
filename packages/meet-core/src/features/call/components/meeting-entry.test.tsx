// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import vietnamese from '../../../../../../apps/meet/messages/vi.json';

const mocks = vi.hoisted(() => ({
  create: vi.fn(async () => ({
    meeting: { id: '10000000-0000-4000-8000-000000000001' },
  })),
  push: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  createWorkspaceMeeting: mocks.create,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));
vi.mock('../lib/meeting-code-input', () => ({ parseMeetingCode: () => null }));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { MeetingEntry } from './meeting-entry';

const m = messages.meet.meetings;

function show(hostName?: string, locale: 'en' | 'vi' = 'en') {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'en' ? messages : vietnamese}
    >
      <MeetingEntry
        canCreate
        hostName={hostName}
        onCreated={vi.fn()}
        wsId="ws"
      />
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('starts an instant meeting titled after the host', async () => {
  show('Minh Anh');
  fireEvent.click(screen.getByRole('button', { name: m.create }));
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith(
      'ws',
      expect.objectContaining({ name: "Minh Anh's meeting" })
    )
  );
  expect(mocks.push).toHaveBeenCalled();
});

it('titles it in Vietnamese and falls back to untitled without a name', async () => {
  show('Gia Huy', 'vi');
  fireEvent.click(
    screen.getByRole('button', { name: vietnamese.meet.meetings.create })
  );
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith(
      'ws',
      expect.objectContaining({ name: 'Cuộc họp của Gia Huy' })
    )
  );
  cleanup();
  vi.clearAllMocks();
  show('  ');
  fireEvent.click(screen.getByRole('button', { name: m.create }));
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith(
      'ws',
      expect.objectContaining({ name: m.untitled })
    )
  );
});

it('offers New meeting and a plain Schedule button instead of a one-item menu', () => {
  show();
  expect(screen.getByRole('button', { name: m.schedule_later })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /options/i })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: m.schedule_later }));
  expect(screen.getByText(m.schedule_later_hint)).toBeTruthy();
  expect(screen.getByRole('button', { name: m.save })).toBeTruthy();
});

it('submits the join dialog with Join and no explainer', () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: m.join }));
  expect(screen.getByRole('button', { name: m.join_submit })).toBeTruthy();
  // "Join meeting" labels only the trigger; the dialog has no explainer line.
  expect(screen.getAllByText(m.join)).toHaveLength(1);
  expect(
    screen.queryByText('Use a Tuturuuu Meet link or meeting code.')
  ).toBeNull();
});
