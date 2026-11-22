// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { MeetToolDefinition } from '../tools/registry';
import { ActivitiesMenu } from './activities-menu';
import { CallActivitySettings } from './call-activity-settings';
import { RoomActivitiesPage, useRoomTools } from './call-room-tools';
import { ControlBar } from './control-bar';

afterEach(cleanup);

const noAction = () => undefined;
const poll: MeetToolDefinition = {
  id: 'polls',
  label: 'meet.call.polls.title',
  icon: () => null,
  Panel: () => null,
};

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
afterEach(() => vi.unstubAllGlobals());

function Intl({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <NuqsTestingAdapter>{children}</NuqsTestingAdapter>
    </NextIntlClientProvider>
  );
}

function Fixture({
  mode,
  manager = false,
  personal = noAction,
  onMode = noAction,
}: {
  mode?: 'hosts' | 'showcase' | 'everyone';
  manager?: boolean;
  personal?: () => void;
  onMode?: (mode: 'hosts' | 'showcase' | 'everyone') => void;
}) {
  const policy = useRoomTools(mode, manager);
  const action = { active: false, toggle: noAction };
  return (
    <Intl>
      <ControlBar
        activePanel={null}
        cameraOn
        handRaised={false}
        micOn
        onLeave={noAction}
        onToggleCamera={noAction}
        onToggleHand={noAction}
        onToggleMic={noAction}
        onTogglePanel={noAction}
        onToggleScreen={noAction}
        participantCount={2}
        screenOn={false}
        unreadChat={0}
        waitingCount={0}
        activities={
          <ActivitiesMenu
            tools={[poll]}
            openToolIds={[]}
            onTool={noAction}
            collaboration={
              policy.canUse
                ? { programming: action, document: action }
                : undefined
            }
            pages={
              policy.canUse
                ? [
                    {
                      id: 'room-activities',
                      label: tools.title,
                      icon: () => null,
                      active: false,
                      listed: false,
                      page: (close) => (
                        <RoomActivitiesPage
                          activities={<span>Live poll</span>}
                          personal={{ active: false, toggle: personal }}
                          settings={
                            policy.canConfigure
                              ? { mode: mode ?? 'hosts', onMode }
                              : undefined
                          }
                          onClose={close}
                        />
                      ),
                    },
                  ]
                : []
            }
          />
        }
      />
    </Intl>
  );
}

const more = () =>
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
const openActivities = () =>
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.call.activities.button })
  );
const openRoomActivities = () =>
  fireEvent.click(
    within(
      screen.getByRole('navigation', {
        name: messages.meet.call.activities.title,
      })
    ).getByRole('button', { name: tools.title })
  );
const tools = messages.meet.call.room_tools;
const coding = messages.programmingPlayground.coding;
const privateTools = messages.meet.call.private_tools.title;

it('keeps launch actions and room activities out of More', () => {
  render(<Fixture manager />);
  more();
  expect(screen.queryByText('Live poll')).toBeNull();
  expect(screen.queryByRole('button', { name: privateTools })).toBeNull();
  expect(screen.queryByRole('button', { name: new RegExp(coding) })).toBeNull();
  expect(screen.queryByRole('radiogroup')).toBeNull();
});

it('moves live shortcuts, personal tools and visibility into Room activities', () => {
  const personal = vi.fn();
  const onMode = vi.fn();
  render(<Fixture manager personal={personal} onMode={onMode} />);
  openActivities();
  openRoomActivities();
  expect(screen.getByText('Live poll')).toBeTruthy();
  fireEvent.click(
    screen.getByRole('radio', { name: new RegExp(tools.everyone) })
  );
  expect(onMode).toHaveBeenCalledWith('everyone');
  fireEvent.click(screen.getByRole('button', { name: privateTools }));
  expect(personal).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('leaves visibility to hosts and Room activities to people who use the tools', () => {
  render(<Fixture mode="everyone" />);
  openActivities();
  openRoomActivities();
  expect(screen.getByRole('button', { name: privateTools })).toBeTruthy();
  expect(screen.queryByRole('radiogroup')).toBeNull();
  cleanup();
  render(<Fixture />);
  openActivities();
  expect(
    within(
      screen.getByRole('navigation', {
        name: messages.meet.call.activities.title,
      })
    ).queryByRole('button', { name: tools.title })
  ).toBeNull();
  expect(screen.queryByRole('button', { name: new RegExp(coding) })).toBeNull();
});

it('sets activity visibility from the settings section', () => {
  const onMode = vi.fn();
  render(
    <Intl>
      <CallActivitySettings mode="hosts" onMode={onMode} />
    </Intl>
  );
  fireEvent.click(
    screen.getByRole('radio', { name: new RegExp(tools.everyone) })
  );
  expect(onMode).toHaveBeenCalledWith('everyone');
});

it('lets managers turn participant Follow and Summon off', () => {
  const onParticipantNavigation = vi.fn();
  render(
    <Intl>
      <CallActivitySettings
        mode="hosts"
        onMode={noAction}
        participantNavigation
        onParticipantNavigation={onParticipantNavigation}
      />
    </Intl>
  );
  fireEvent.click(
    screen.getByRole('switch', {
      name: new RegExp(
        messages.meet.call.activities_settings.participant_navigation
      ),
    })
  );
  expect(onParticipantNavigation).toHaveBeenCalledWith(false);
});
