// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { RoomNavigation } from '../hooks/use-room-navigation';
import { INITIAL_CALL_STATE } from '../lib/call-state';
import type { MeetRoomController } from '../lib/room-controller';
import { CallControlDock } from './call-control-dock';
import {
  CallSettingsLinkProvider,
  useCallSettingsDialog,
} from './call-settings-link';

// Tooltips render inline so their text can be read without hovering.
vi.mock('@tuturuuu/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <span role="tooltip">{children}</span>
  ),
}));
vi.mock('./call-extras', () => ({
  CallExtras: () => null,
  CallExtrasDialogs: () => null,
  useCallExtrasDialog: () => [null, () => undefined],
}));
vi.mock('./call-reactions', () => ({ CallReactionsMenu: () => null }));

const call = messages.meet.call;
const noop = () => undefined;

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

function nav(others: number): RoomNavigation {
  return {
    allowed: true,
    canManage: true,
    following: null,
    leading: null,
    onStage: true,
    others: Array.from({ length: others }, (_, index) => ({
      userId: `user-${index}`,
      displayName: `Person ${index}`,
    })),
    paused: false,
    startLeading: vi.fn(),
    stopFollowing: vi.fn(),
    stopLeading: vi.fn(),
    summon: vi.fn(),
    surfaceName: 'Stage',
    view: { surface: 'stage' },
  } as unknown as RoomNavigation;
}

const room = {
  state: { ...INITIAL_CALL_STATE, role: 'host' },
  media: { audioEnabled: true, videoEnabled: true, screenEnabled: false },
  cameraLook: { filter: 'none' },
  react: noop,
  updateSettings: noop,
} as unknown as MeetRoomController;

function SettingsProbe() {
  return <output>{useCallSettingsDialog().open ? 'settings open' : ''}</output>;
}

function renderDock(props: Partial<ComponentProps<typeof CallControlDock>>) {
  const toggle = { active: false, toggle: vi.fn() };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <NuqsTestingAdapter>
          <CallSettingsLinkProvider>
            <CallControlDock
              meetingId="5e5217de-9bb3-4e20-8d99-526ad3e7e34f"
              room={room}
              canManage
              panel={null}
              personal={toggle}
              onDrawer={noop}
              sharedAudio={
                { microphonePaused: false } as ComponentProps<
                  typeof CallControlDock
                >['sharedAudio']
              }
              busyDevices={{}}
              runMediaAction={noop}
              recording={
                { isBusy: false, toggle: vi.fn() } as unknown as ComponentProps<
                  typeof CallControlDock
                >['recording']
              }
              handRaised={false}
              participantCount={2}
              unreadChat={0}
              onLeave={noop}
              roomTools={{
                canConfigure: false,
                canUse: false,
                showPreview: false,
              }}
              tools={{ shown: [], activeId: null, toggle: noop }}
              activities={{ liveControl: null, controls: null, entries: [] }}
              programming={toggle}
              document={toggle}
              layout="auto"
              setLayout={noop}
              nav={nav(2)}
              {...props}
            />
            <SettingsProbe />
          </CallSettingsLinkProvider>
        </NuqsTestingAdapter>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

const openMore = () =>
  fireEvent.click(screen.getByRole('button', { name: call.more_actions }));
const menu = () =>
  within(screen.getByRole('dialog', { name: call.more_actions }));

it('moves Follow and Summon into More under Guide the room with the hint', () => {
  renderDock({});
  expect(screen.queryByRole('button', { name: call.follow.button })).toBeNull();
  openMore();
  expect(menu().getByText(call.navigation.guide)).toBeTruthy();
  const follow = menu().getByRole('button', { name: call.follow.button });
  menu().getByRole('button', { name: call.summon.button });
  expect(menu().getAllByText(call.activities.hint)).toHaveLength(2);
  fireEvent.click(follow);
  expect(screen.getByRole('dialog', { name: call.follow.button })).toBeTruthy();
});

it('keeps Follow and Summon visible but disabled with the reason when alone', () => {
  renderDock({ nav: nav(0) });
  openMore();
  const follow = menu().getByRole('button', {
    name: call.follow.button,
  }) as HTMLButtonElement;
  expect(follow.disabled).toBe(true);
  expect(menu().getAllByText(call.navigation.alone)).toHaveLength(2);
});

it('lists Transcript and notes only for people who may read them', () => {
  const toggle = vi.fn();
  renderDock({ transcript: { active: false, toggle } });
  openMore();
  const row = menu().getByRole('switch', { name: messages.meet.ai.title });
  expect(row.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(row);
  expect(toggle).toHaveBeenCalledOnce();
  cleanup();
  renderDock({});
  openMore();
  expect(menu().queryByText(messages.meet.ai.title)).toBeNull();
});

it('opens the meeting settings from More', () => {
  renderDock({});
  openMore();
  fireEvent.click(menu().getByRole('button', { name: call.settings_title }));
  expect(screen.getByText('settings open')).toBeTruthy();
});

it('puts the room timer controls in Activities for hosts and co-hosts', () => {
  const timerRoom = {
    ...room,
    state: { ...room.state, classRole: 'cohost', classTimerEnabled: true },
  } as unknown as MeetRoomController;
  renderDock({ room: timerRoom });
  fireEvent.click(screen.getByRole('button', { name: call.activities.button }));
  fireEvent.click(
    screen.getByRole('button', { name: `Open ${call.class_timer}` })
  );
  expect(screen.getByRole('button', { name: '5 min' })).toBeTruthy();
  cleanup();
  renderDock({
    room: {
      ...room,
      state: {
        ...room.state,
        classRole: 'participant',
        classTimerEnabled: true,
      },
    } as unknown as MeetRoomController,
  });
  expect(
    screen.queryByRole('button', { name: call.activities.button })
  ).toBeNull();
});
