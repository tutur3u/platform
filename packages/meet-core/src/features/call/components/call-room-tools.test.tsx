// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { MeetToolDefinition } from '../tools/registry';
import { ActivitiesMenu } from './activities-menu';
import { CallActivitySettings } from './call-activity-settings';
import { CallRoomTools, useRoomTools } from './call-room-tools';
import { ControlBar } from './control-bar';

afterEach(cleanup);

const noAction = () => undefined;
const poll: MeetToolDefinition = {
  id: 'polls',
  label: 'meet.call.polls.title',
  icon: () => null,
  Panel: () => null,
};

function Intl({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

function Fixture({
  mode,
  manager = false,
  feedback = noAction,
  onTool = noAction,
}: {
  mode?: 'hosts' | 'showcase' | 'everyone';
  manager?: boolean;
  feedback?: () => void;
  onTool?: (id: string) => void;
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
            activeToolId={null}
            onTool={onTool}
            collaboration={
              policy.canUse
                ? { programming: action, document: action }
                : undefined
            }
            preview={policy.showPreview ? { onFeedback: feedback } : undefined}
          />
        }
        extraControls={
          <CallRoomTools
            actions={{ personal: action }}
            activities={<span>Live poll</span>}
            policy={policy}
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
const tools = messages.meet.call.room_tools;
const coding = messages.programmingPlayground.coding;

it('keeps launch actions out of More while leaving live activities reachable', () => {
  render(<Fixture />);
  expect(
    screen.getByRole('button', { name: messages.meet.call.mute })
  ).toBeTruthy();
  expect(screen.queryByText('Live poll')).toBeNull();
  more();
  expect(screen.getByText('Live poll')).toBeTruthy();
  expect(screen.queryByRole('button', { name: new RegExp(coding) })).toBeNull();
  expect(screen.queryByRole('radiogroup')).toBeNull();
});

it('lists tools in Activities for attendees but keeps collaboration for hosts', () => {
  const onTool = vi.fn();
  render(<Fixture onTool={onTool} />);
  openActivities();
  expect(screen.queryByRole('button', { name: new RegExp(coding) })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Polls/ }));
  expect(onTool).toHaveBeenCalledWith('polls');
  cleanup();
  render(<Fixture manager />);
  openActivities();
  expect(screen.getByRole('button', { name: new RegExp(coding) })).toBeTruthy();
  cleanup();
  render(<Fixture mode="everyone" />);
  openActivities();
  expect(screen.getByRole('button', { name: new RegExp(coding) })).toBeTruthy();
});

it('previews activities with a feedback shortcut in Showcase', () => {
  const feedback = vi.fn();
  render(<Fixture mode="showcase" feedback={feedback} />);
  openActivities();
  expect(screen.getByText(tools.preview)).toBeTruthy();
  expect(screen.getByText(coding)).toBeTruthy();
  expect(screen.queryByRole('button', { name: new RegExp(coding) })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: tools.feedback }));
  expect(feedback).toHaveBeenCalledOnce();
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
