// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { MeetRoomController } from '../lib/room-controller';
import { CallSettings } from './call-settings';

vi.mock('./device-settings', () => ({
  DeviceSettings: () => <div>Device controls</div>,
}));
vi.mock('./classroom-settings', () => ({ ClassroomSettings: () => null }));
vi.mock('./chat-settings', () => ({ ChatSettings: () => null }));
vi.mock('./connection-panel', () => ({ ConnectionPanel: () => null }));
vi.mock('./ai-costs', () => ({ AiCosts: () => null }));
vi.mock('./cloudflare-costs', () => ({ CloudflareCosts: () => null }));
vi.mock('./meeting-public-settings', () => ({
  MeetingPublicSettings: () => null,
}));
vi.mock('./recording-settings', () => ({ RecordingSettings: () => null }));
vi.mock('@tuturuuu/meet-core/features/live-assistant/memory-settings', () => ({
  MeetMemorySettings: () => null,
}));
vi.mock(
  '../../../../../ui/src/components/ui/custom/onboarding-settings-panel',
  () => ({ OnboardingSettingsPanel: () => null })
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('finds permissions with shared settings search and dispatches all host lock toggles', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
  const updateSettings = vi.fn();
  const room = {
    getBandwidthMode: () => 'auto',
    updateSettings,
    state: {
      role: 'host',
      selfUserId: 'host',
      participants: {},
      settings: { shareNotes: false },
    },
  } as unknown as MeetRoomController;
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <NuqsTestingAdapter>
        <CallSettings
          room={room}
          meetingId="meeting"
          canManage
          ai={{} as Parameters<typeof CallSettings>[0]['ai']}
          sound={false}
          onSound={vi.fn()}
          outputDeviceId=""
          onOutput={vi.fn()}
        />
      </NuqsTestingAdapter>
    </NextIntlClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Meeting settings' }));
  expect(screen.getByText('Device controls')).toBeDefined();
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Search settings...' }),
    { target: { value: 'Lock cameras' } }
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Chat & recording' })
    ).toBeNull()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Permissions & locks' }));
  for (const name of [
    'Lock microphones',
    'Lock cameras',
    'Lock screen sharing',
    'Admit everyone automatically',
  ])
    fireEvent.click(screen.getByRole('switch', { name }));
  expect(updateSettings.mock.calls).toEqual([
    [{ micsLocked: true }],
    [{ camerasLocked: true }],
    [{ screensLocked: true }],
    [{ skipLobby: true }],
  ]);
});
