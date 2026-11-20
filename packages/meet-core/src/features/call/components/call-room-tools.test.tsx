// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { CallRoomTools, useRoomTools } from './call-room-tools';
import { ControlBar } from './control-bar';

afterEach(cleanup);

const noAction = () => undefined;

function Fixture({
  mode,
  manager = false,
  onMode = noAction,
  feedback = noAction,
}: {
  mode?: 'hosts' | 'showcase' | 'everyone';
  manager?: boolean;
  onMode?: (mode: string) => void;
  feedback?: () => void;
}) {
  const policy = useRoomTools(mode, manager);
  const action = { active: false, toggle: noAction };
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
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
        extraControls={
          <CallRoomTools
            actions={{
              document: action,
              personal: action,
              programming: action,
              feedback,
            }}
            activities={<span>Live poll</span>}
            mode={mode}
            onMode={onMode}
            policy={policy}
          />
        }
      />
    </NextIntlClientProvider>
  );
}

const more = () =>
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
const tools = messages.meet.call.room_tools;
const coding = messages.programmingPlayground.coding;

it('keeps advanced tools out of the default attendee menu while leaving live activities reachable', () => {
  render(<Fixture />);
  expect(
    screen.getByRole('button', { name: messages.meet.call.mute })
  ).toBeTruthy();
  expect(screen.queryByText('Live poll')).toBeNull();
  more();
  expect(screen.getByText('Live poll')).toBeTruthy();
  expect(screen.queryByRole('button', { name: coding })).toBeNull();
  expect(screen.queryByRole('radiogroup')).toBeNull();
});

it('offers feedback instead of launch actions in Showcase', () => {
  const feedback = vi.fn();
  render(<Fixture mode="showcase" feedback={feedback} />);
  more();
  expect(screen.getByText(tools.preview)).toBeTruthy();
  expect(screen.getByText(coding)).toBeTruthy();
  expect(screen.queryByRole('button', { name: coding })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: tools.feedback }));
  expect(feedback).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: tools.feedback })).toBeNull();
});

it('lets managers set visibility and shows tools to attendees only when enabled', () => {
  const onMode = vi.fn();
  render(<Fixture manager onMode={onMode} />);
  more();
  expect(screen.getByRole('button', { name: coding })).toBeTruthy();
  fireEvent.click(
    screen.getByRole('radio', { name: new RegExp(tools.everyone) })
  );
  expect(onMode).toHaveBeenCalledWith('everyone');
  cleanup();
  render(<Fixture mode="everyone" />);
  more();
  expect(screen.getByRole('button', { name: coding })).toBeTruthy();
  expect(screen.queryByRole('radiogroup')).toBeNull();
});
