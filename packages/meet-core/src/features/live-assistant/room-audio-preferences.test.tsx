// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';
import type { MeetRoomController } from '../call/lib/room-controller';
import { deliverRoomAssistantAudio, RoomAssistantAudio } from './room-audio';

const audio = vi.hoisted(() => ({
  mute: vi.fn(),
  unlock: vi.fn(async () => true),
  clear: vi.fn(),
  play: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({ controlMeetLive: vi.fn() }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('../call/components/mira-profile', () => ({
  MiraAvatar: () => <span />,
}));
vi.mock('./room-players', () => ({
  RoomAudioPlayers: class {
    setVolume = vi.fn();
    mute = audio.mute;
    unlock = audio.unlock;
    clear = audio.clear;
    play = audio.play;
    activate() {}
    deactivate() {}
    interrupt() {}
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('controls mic input and local playback independently, and preserves playback on roster updates', async () => {
  const setAssistantAudio = vi.fn();
  const room = {
    state: {
      selfUserId: 'self',
      liveAssistant: { sessionId: 'live', ownerId: 'owner' },
      participants: {
        self: {
          assistantAudio: { microphoneEnabled: false, speakerEnabled: false },
        },
      },
    },
    setAssistantAudio,
  } as unknown as MeetRoomController;
  render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <RoomAssistantAudio
        room={room}
        meetingId="preferences-test"
        outputDeviceId=""
      />
    </NextIntlClientProvider>
  );
  act(() => {
    deliverRoomAssistantAudio('preferences-test', {
      type: 'assistant.live',
      sessionId: 'live',
      ownerId: 'owner',
      active: true,
    });
  });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: messages.meet.live.deafen_mira })
    ).toBeTruthy()
  );
  await waitFor(() =>
    expect(setAssistantAudio).toHaveBeenLastCalledWith({
      sessionId: 'live',
      microphoneEnabled: false,
      speakerEnabled: true,
    })
  );
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.unmute_to_mira })
  );
  expect(setAssistantAudio).toHaveBeenLastCalledWith({
    sessionId: 'live',
    microphoneEnabled: true,
    speakerEnabled: true,
  });
  act(() => {
    deliverRoomAssistantAudio('preferences-test', {
      type: 'admission.approved',
      participants: [],
    });
  });
  expect(
    screen.getByRole('button', { name: messages.meet.live.deafen_mira })
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.deafen_mira })
  );
  expect(audio.mute).toHaveBeenCalled();
  await waitFor(() =>
    expect(setAssistantAudio).toHaveBeenLastCalledWith({
      sessionId: 'live',
      microphoneEnabled: true,
      speakerEnabled: false,
    })
  );
  const unlockCount = audio.unlock.mock.calls.length;
  act(() => {
    deliverRoomAssistantAudio('preferences-test', {
      type: 'assistant.live',
      sessionId: 'live',
      ownerId: 'owner',
      active: true,
    });
  });
  expect(audio.unlock).toHaveBeenCalledTimes(unlockCount);
  expect(
    screen.getByRole('button', { name: messages.meet.live.room_audio_enable })
  ).toBeTruthy();
});

it('offers a manual listen fallback when automatic playback is blocked', async () => {
  audio.unlock.mockRejectedValueOnce(new Error('NotAllowedError'));
  const setAssistantAudio = vi.fn();
  const room = {
    state: {
      selfUserId: 'self',
      participants: {},
      liveAssistant: { sessionId: 'blocked', ownerId: 'owner' },
    },
    setAssistantAudio,
  } as unknown as MeetRoomController;
  render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <RoomAssistantAudio
        room={room}
        meetingId="autoplay-test"
        outputDeviceId=""
      />
    </NextIntlClientProvider>
  );
  await act(async () => {
    deliverRoomAssistantAudio('autoplay-test', {
      type: 'assistant.live',
      sessionId: 'blocked',
      ownerId: 'owner',
      active: true,
    });
  });
  expect(
    screen.getByRole('button', { name: messages.meet.live.room_audio_enable })
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.room_audio_enable })
  );
  await screen.findByRole('button', { name: messages.meet.live.deafen_mira });
  await waitFor(() =>
    expect(setAssistantAudio).toHaveBeenLastCalledWith({
      sessionId: 'blocked',
      microphoneEnabled: false,
      speakerEnabled: true,
    })
  );
});

it.each([false, true])(
  'restores playback after shared audio ends, respecting deafen=%s',
  async (deafened) => {
    const room = {
      state: {
        participants: {},
        liveAssistant: { sessionId: 'shared', ownerId: 'owner' },
      },
      setAssistantAudio: vi.fn(),
    } as unknown as MeetRoomController;
    const meetingId = `shared-${deafened}`;
    const view = (audioSuppressed: boolean) => (
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <RoomAssistantAudio
          room={room}
          meetingId={meetingId}
          outputDeviceId=""
          audioSuppressed={audioSuppressed}
        />
      </NextIntlClientProvider>
    );
    const { rerender } = render(view(false));
    await act(async () => {
      deliverRoomAssistantAudio(meetingId, {
        type: 'assistant.live',
        sessionId: 'shared',
        ownerId: 'owner',
        active: true,
      });
    });
    const button = screen.getByRole('button', {
      name: messages.meet.live.deafen_mira,
    });
    if (deafened) fireEvent.click(button);
    rerender(view(true));
    const unlocks = audio.unlock.mock.calls.length;
    rerender(view(false));
    if (deafened) {
      expect(audio.unlock).toHaveBeenCalledTimes(unlocks);
      expect(
        screen.getByRole('button', {
          name: messages.meet.live.room_audio_enable,
        })
      ).toBeTruthy();
    } else {
      await screen.findByRole('button', {
        name: messages.meet.live.deafen_mira,
      });
      expect(audio.unlock.mock.calls.length).toBeGreaterThan(unlocks);
    }
  }
);
