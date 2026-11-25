// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import {
  joinQrUsesCard,
  offersJoinQrOptions,
  roomKeepsJoinQr,
  useStageJoinQr,
} from '../hooks/use-stage-join-qr';
import { type CallState, INITIAL_CALL_STATE } from '../lib/call-state';
import type { MeetRoomController } from '../lib/room-controller';
import { type CallLayout, CallStage } from './call-stage';
import { StageJoinQr } from './stage-join-qr';

vi.mock('../prejoin/use-meet-call-ux', () => ({ useMeetCallUx: () => true }));
vi.mock('qrcode.react', () => ({ QRCodeSVG: () => <svg /> }));
vi.mock('./participant-tile', () => ({
  ParticipantTile: ({ focusKey }: { focusKey: string }) => (
    <div data-testid={focusKey} />
  ),
}));

const person = (userId: string, screenEnabled = false) => ({
  userId,
  displayName: userId,
  media: { audioEnabled: true, videoEnabled: true, screenEnabled },
});

/** The call shell's wiring: the stage reports fill, the QR picks its form. */
function Room({
  sharing = false,
  layout = 'grid',
}: {
  sharing?: boolean;
  layout?: CallLayout;
}) {
  const state: CallState = {
    ...INITIAL_CALL_STATE,
    selfUserId: 'me',
    participants: { me: person('me'), you: person('you', sharing) },
  };
  const room = { remoteMedia: {}, state } as unknown as MeetRoomController;
  const qr = useStageJoinQr(state, false);
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <main>
        <div data-testid="stage">
          <CallStage
            room={room}
            layout={layout}
            focus={null}
            onFocus={vi.fn()}
            onChat={vi.fn()}
            selfInGrid
            reserveCorner={qr.reserveCorner}
            onFillChange={qr.setStageFilled}
          />
        </div>
        <StageJoinQr meetingId={meetingId} qr={qr} settings={state.settings} />
      </main>
    </NextIntlClientProvider>
  );
}

const meetingId = '00000000-0000-4000-8000-000000000001';
const stageRoot = () =>
  screen.getByTestId('stage').firstElementChild as HTMLElement;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('keeps tile names and resume audio clear of the card', () => {
  render(<Room />);
  expect(screen.getByRole('figure')).toBeTruthy();
  // Tiles, with their name strip and resume-audio button, lay out right of
  // the gutter the card sits in.
  expect(stageRoot().className).toContain('lg:pl-44');
  expect(stageRoot().contains(screen.getByTestId('you:camera'))).toBe(true);
});

it('uses the chip while a screen share fills the stage', () => {
  render(<Room sharing />);
  expect(screen.getByTestId('you:screen')).toBeTruthy();
  expect(screen.queryByRole('figure')).toBeNull();
  expect(stageRoot().className).not.toContain('lg:pl-44');
});

it('uses the chip while a spotlight fills the stage', () => {
  render(<Room layout="spotlight" />);
  expect(screen.queryByRole('figure')).toBeNull();
  expect(stageRoot().className).not.toContain('lg:pl-44');
});

it('chooses the card only when nothing fills the stage', () => {
  const open = { activityOpen: false, presenceOnly: false, stageFilled: false };
  expect(joinQrUsesCard(open)).toBe(true);
  expect(joinQrUsesCard({ ...open, stageFilled: true })).toBe(false);
  expect(joinQrUsesCard({ ...open, activityOpen: true })).toBe(false);
  expect(joinQrUsesCard({ ...open, presenceOnly: true })).toBe(false);
});

it('needs the room to announce the joinQr feature', () => {
  expect(roomKeepsJoinQr({})).toBe(false);
  expect(roomKeepsJoinQr({ settingsFeatures: [] })).toBe(false);
  expect(roomKeepsJoinQr({ settingsFeatures: ['joinQr'] })).toBe(true);
});

it('offers the card options to managers only in a room that keeps them', () => {
  const host = { role: 'host' as const, canManageParticipants: true };
  const cohost = { role: 'speaker' as const, canManageParticipants: true };
  const participant = { role: 'speaker' as const, canManageParticipants: false };
  expect(offersJoinQrOptions({ ...host, settingsFeatures: ['joinQr'] })).toBe(
    true
  );
  expect(
    offersJoinQrOptions({ ...cohost, settingsFeatures: ['joinQr'] })
  ).toBe(true);
  // An older realtime Worker announces no features: no options for anyone.
  expect(offersJoinQrOptions({ ...host, settingsFeatures: [] })).toBe(false);
  expect(offersJoinQrOptions({ ...cohost })).toBe(false);
  expect(
    offersJoinQrOptions({ ...participant, settingsFeatures: ['joinQr'] })
  ).toBe(false);
});
