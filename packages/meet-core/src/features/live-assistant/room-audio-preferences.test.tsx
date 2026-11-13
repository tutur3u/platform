// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';
import type { MeetRoomController } from '../call/lib/room-controller';
import { deliverRoomAssistantAudio, RoomAssistantAudio } from './room-audio';
afterEach(cleanup);
it('shows the private microphone indicator to the room and never plays room Mira audio', () => {
  const room = {
    state: {
      participants: {
        synthetic: {
          userId: 'synthetic',
          displayName: 'Synthetic person',
          miraPrivate: true,
        },
      },
    },
  } as unknown as MeetRoomController;
  render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <RoomAssistantAudio room={room} meetingId="synthetic" outputDeviceId="" />
    </NextIntlClientProvider>
  );
  expect(screen.getByRole('status').textContent).toContain('Synthetic person');
  expect(screen.getByRole('status').textContent).toContain(
    'only their microphone'
  );
  expect(
    deliverRoomAssistantAudio('synthetic', {
      type: 'assistant.audio',
      sessionId: 'synthetic',
      data: 'synthetic',
      sampleRate: 24000,
    } as never)
  ).toBe(false);
  expect(screen.queryByRole('button')).toBeNull();
});
