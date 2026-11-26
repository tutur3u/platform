// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { setArenaAnnouncement } from '../lib/quiz-arena-announcement';
import { useCallActivities } from './call-activities';

const live = vi.hoisted(() => ({
  poll: undefined as unknown,
  arena: undefined as unknown,
}));
vi.mock('../lib/polls-client', () => ({
  useCallPolls: () => ({ data: live.poll }),
}));
const arenaHook = vi.hoisted(() => vi.fn());
vi.mock('../lib/quiz-arena-client', () => ({
  useCallQuizArena: (...args: unknown[]) => {
    arenaHook(...args);
    return { data: live.arena };
  },
}));
vi.mock('./forms/meet-forms-activity', () => ({
  MeetFormsActivity: ({ open }: { open: boolean }) => (
    <div data-testid="forms" data-open={String(open)} />
  ),
}));
afterEach(cleanup);

let activities: ReturnType<typeof useCallActivities>;
const open = new Set<string>();
function Harness({
  shortcuts = false,
  guest = false,
}: {
  shortcuts?: boolean;
  guest?: boolean;
}) {
  activities = useCallActivities({
    meetingId: 'm',
    accountId: 'a',
    enabled: true,
    requiresAccount: guest,
    formsEnabled: true,
    formsAccess: { canManage: true, canReadWorkspace: true },
    showTools: false,
    stage: {
      isOpen: (id) => open.has(id),
      toggle: (id) => (open.has(id) ? open.delete(id) : open.add(id)),
      close: (id) => open.delete(id),
    },
  });
  return (
    <>
      {activities.dialog}
      {shortcuts && activities.controls}
    </>
  );
}
const forms = () => activities.entries.find((entry) => entry.id === 'forms');
const mount = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Harness />
    </NextIntlClientProvider>
  );

it('keeps the forms dialog mounted once opened, so drafts survive closing it', async () => {
  mount();
  expect(screen.queryByTestId('forms')).toBeNull();
  act(() => forms()?.toggle());
  const dialog = await screen.findByTestId('forms');
  expect(dialog.getAttribute('data-open')).toBe('true');
  expect(forms()?.active).toBe(true);
  act(() => forms()?.toggle());
  expect(screen.getByTestId('forms')).toBe(dialog);
  expect(dialog.getAttribute('data-open')).toBe('false');
  expect(forms()?.active).toBe(false);
  act(() => forms()?.toggle());
  expect(screen.getByTestId('forms')).toBe(dialog);
  expect(dialog.getAttribute('data-open')).toBe('true');
});

it('lists a live poll and a live Quiz Arena together in the shortcuts', () => {
  live.poll = { polls: [{ status: 'active' }] };
  live.arena = { kind: 'full', meta: { phase: 'question' } };
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Harness shortcuts />
    </NextIntlClientProvider>
  );
  live.poll = undefined;
  live.arena = undefined;
  expect(screen.getByRole('button', { name: /poll/i })).toBeTruthy();
  expect(screen.getByRole('button', { name: /quiz arena/i })).toBeTruthy();
});

it('keeps background Quiz Arena polling off for a guest with the panel closed', () => {
  arenaHook.mockClear();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Harness guest shortcuts />
    </NextIntlClientProvider>
  );
  expect(arenaHook).toHaveBeenLastCalledWith('m', 'a', false, false);
  act(() => setArenaAnnouncement('m', true));
  expect(screen.getByRole('button', { name: /quiz arena/i })).toBeTruthy();
  expect(arenaHook).toHaveBeenLastCalledWith('m', 'a', false, false);
  act(() => setArenaAnnouncement('m', false));
  expect(screen.queryByRole('button', { name: /quiz arena/i })).toBeNull();
  cleanup();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Harness />
    </NextIntlClientProvider>
  );
  expect(arenaHook).toHaveBeenLastCalledWith('m', 'a', true, false);
});
