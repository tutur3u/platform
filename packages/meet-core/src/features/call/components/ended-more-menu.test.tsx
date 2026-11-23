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

const mocks = vi.hoisted(() => ({ state: vi.fn(), restore: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  getMeetCallRoomState: mocks.state,
  restoreMeetCallRoom: mocks.restore,
}));
vi.mock('./ended-meeting-settings', () => ({
  EndedMeetingSettings: () => null,
}));
vi.mock('./ended-manual-task', () => ({ EndedManualTask: () => null }));

import { EndedMoreMenu } from './ended-more-menu';

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderMenu(onRestored: () => void) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EndedMoreMenu
        accountId="account-a"
        wsId="ws"
        meetingId="meeting"
        canRestore
        canAddTask={false}
        canManage
        onShareNotesChange={() => {}}
        reader={null}
        readerOpen={false}
        onToggleReader={() => {}}
        onRestored={onRestored}
      />
    </NextIntlClientProvider>
  );
}
const openMenu = () =>
  fireEvent.keyDown(screen.getByRole('button', { name: 'More' }), {
    key: 'Enter',
  });

it('keeps restoring and reloads when the menu closes mid-restore', async () => {
  let release!: (value: { ended: boolean; lifecycleVersion: number }) => void;
  mocks.state.mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    })
  );
  mocks.restore.mockResolvedValue({ ended: false });
  const restored = vi.fn();
  renderMenu(restored);
  openMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Restore meeting' }));
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: 'Escape',
  });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  release({ ended: true, lifecycleVersion: 3 });
  await waitFor(() => expect(restored).toHaveBeenCalledOnce());
  expect(mocks.restore).toHaveBeenCalledWith('meeting', 3, 'account-a');
});

it('shows a failed restore outside the closed menu', async () => {
  mocks.state.mockRejectedValue(new Error('offline'));
  renderMenu(vi.fn());
  openMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Restore meeting' }));
  const alert = await screen.findByText(messages.meet.call.restore_failed);
  expect(alert.getAttribute('role')).toBe('alert');
});
