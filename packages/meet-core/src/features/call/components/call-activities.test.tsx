// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { useCallActivities } from './call-activities';

vi.mock('../lib/polls-client', () => ({
  useCallPolls: () => ({ data: undefined }),
}));
vi.mock('../lib/quiz-arena-client', () => ({
  useCallQuizArena: () => ({ data: undefined }),
}));
vi.mock('./forms/meet-forms-activity', () => ({
  MeetFormsActivity: ({ open }: { open: boolean }) => (
    <div data-testid="forms" data-open={String(open)} />
  ),
}));
afterEach(cleanup);

let activities: ReturnType<typeof useCallActivities>;
const open = new Set<string>();
function Harness() {
  activities = useCallActivities({
    meetingId: 'm',
    accountId: 'a',
    enabled: true,
    formsEnabled: true,
    formsAccess: { canManage: true, canReadWorkspace: true },
    showTools: false,
    stage: {
      isOpen: (id) => open.has(id),
      toggle: (id) => (open.has(id) ? open.delete(id) : open.add(id)),
      close: (id) => open.delete(id),
    },
  });
  return <>{activities.dialog}</>;
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
