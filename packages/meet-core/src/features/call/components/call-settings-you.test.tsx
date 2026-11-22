// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { MeetRoomController } from '../lib/room-controller';
import { CallSettings } from './call-settings';
import { CallSettingsLinkProvider } from './call-settings-link';

vi.mock('./device-settings', () => ({
  DeviceSettings: () => <div>Device controls</div>,
}));
vi.mock('./call-profile-settings', () => ({
  CallProfileSettings: ({ siteKey }: { siteKey?: string }) => (
    <div>Profile page {siteKey}</div>
  ),
}));
vi.mock('./call-appearance-settings', () => ({
  CallAppearanceSettings: ({ signedIn }: { signedIn: boolean }) => (
    <div>Appearance page {signedIn ? 'account' : 'guest'}</div>
  ),
}));
vi.mock('./classroom-settings', () => ({ ClassroomSettings: () => null }));
vi.mock('./chat-settings', () => ({ ChatSettings: () => null }));
vi.mock('./connection-panel', () => ({ ConnectionPanel: () => null }));
vi.mock('./meeting-public-settings', () => ({
  MeetingPublicSettings: () => null,
}));
vi.mock('./recording-settings', () => ({ RecordingSettings: () => null }));
vi.mock('@tuturuuu/meet-core/features/live-assistant/memory-settings', () => ({
  MeetMemorySettings: () => null,
}));
vi.mock('../../live-assistant/mira-audience-settings', () => ({
  MiraAudienceSettings: () => null,
}));

const call = messages.meet.call;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderSettings(accountId?: string) {
  const room = {
    getBandwidthMode: () => 'auto',
    updateSettings: vi.fn(),
    state: {
      role: 'speaker',
      selfUserId: 'self',
      participants: {
        self: { userId: 'self', displayName: 'Alex', accountId },
      },
      settings: { shareNotes: false },
    },
  } as unknown as MeetRoomController;
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <NuqsTestingAdapter>
        <CallSettingsLinkProvider siteKey="site-key">
          <CallSettings
            room={room}
            meetingId="meeting"
            canManage={false}
            ai={{} as Parameters<typeof CallSettings>[0]['ai']}
            sound={false}
            onSound={vi.fn()}
            outputDeviceId=""
            onOutput={vi.fn()}
          />
        </CallSettingsLinkProvider>
      </NuqsTestingAdapter>
    </NextIntlClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: call.settings_title }));
}

it('opens a You group with Profile and Appearance for signed-in participants', () => {
  renderSettings('account-1');
  expect(screen.getByText(call.you)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: call.settings_profile }));
  expect(screen.getByText(call.settings_pages.profile)).toBeDefined();
  // The Turnstile site key reaches the profile save through the call shell.
  expect(screen.getByText('Profile page site-key')).toBeDefined();
  fireEvent.click(
    screen.getByRole('button', { name: call.settings_appearance })
  );
  expect(screen.getByText(call.settings_pages.appearance)).toBeDefined();
  expect(screen.getByText('Appearance page account')).toBeDefined();
});

it('gives guests Appearance only, with the device-local theme', () => {
  renderSettings();
  expect(
    screen.queryByRole('button', { name: call.settings_profile })
  ).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: call.settings_appearance })
  );
  expect(screen.getByText('Appearance page guest')).toBeDefined();
});
