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
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { MeetRoomController } from '../lib/room-controller';

const f = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('@tuturuuu/internal-api/workspace-configs', () => ({
  getMiraAudienceAttestation: f.read,
  updateMiraAudienceAttestation: f.write,
}));
vi.mock('@tuturuuu/internal-api', () => ({ readPrivateMiraPolicy: vi.fn() }));
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

import { MiraWorkspaceOff } from '../../live-assistant/mira-workspace-off';
import { CallSettings } from './call-settings';
import { CallSettingsLinkProvider } from './call-settings-link';

const copy = messages.meet.mira_adults;
const off = { attested: false, attestedAt: null, attestedByCurrentUser: false };

function show(participants: Record<string, { accountId?: string }>) {
  const room = {
    getBandwidthMode: () => 'auto',
    updateSettings: vi.fn(),
    state: {
      role: 'participant',
      selfUserId: 'device',
      participants,
      settings: { shareNotes: false },
    },
  } as unknown as MeetRoomController;
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <NuqsTestingAdapter>
          <CallSettingsLinkProvider>
            <MiraWorkspaceOff wsId="synthetic-workspace" />
            <CallSettings
              room={room}
              meetingId="synthetic-meeting"
              wsId="synthetic-workspace"
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
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
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

it('opens the meeting settings on the Mira section from a refusal and saves the switch there', async () => {
  f.read.mockResolvedValue(off);
  f.write.mockResolvedValue({
    attested: true,
    attestedAt: '2026-11-20T00:00:00Z',
    attestedByCurrentUser: true,
  });
  show({ device: { accountId: 'synthetic-account' } });
  expect(screen.queryByRole('switch', { name: copy.toggle })).toBeNull();
  fireEvent.click(
    await screen.findByRole('button', { name: copy.open_settings })
  );
  const toggle = await screen.findByRole('switch', { name: copy.toggle });
  expect(screen.getByRole('button', { name: copy.settings_tab })).toBeTruthy();
  expect(screen.queryByText('Device controls')).toBeNull();
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(f.write).toHaveBeenCalledExactlyOnceWith('synthetic-workspace', true)
  );
  await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
});

it('offers the Mira section in the settings navigation only to signed-in participants', async () => {
  f.read.mockResolvedValue(off);
  show({ device: {} });
  fireEvent.click(screen.getByRole('button', { name: 'Meeting settings' }));
  expect(await screen.findByText('Device controls')).toBeDefined();
  expect(screen.queryByRole('button', { name: copy.settings_tab })).toBeNull();
});
