// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { type PrejoinCapture, usePrejoinCapture } from './use-prejoin-capture';

type FakeTrack = {
  stop: ReturnType<typeof vi.fn>;
  addEventListener: () => void;
  removeEventListener: () => void;
};

const tracks: FakeTrack[] = [];
const getUserMedia = vi.fn(async () => {
  const track: FakeTrack = {
    stop: vi.fn(),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  tracks.push(track);
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
    getVideoTracks: () => [],
  };
});

let capture: PrejoinCapture | null = null;
function Harness() {
  capture = usePrejoinCapture();
  return null;
}

beforeEach(() => {
  tracks.length = 0;
  getUserMedia.mockClear();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: async () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
});
afterEach(() => {
  cleanup();
  capture = null;
});

function show() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Harness />
    </NextIntlClientProvider>
  );
}

it('starts the preview and stops the meter stream when the room takes the devices', async () => {
  show();
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
  act(() => {
    capture?.handOff();
  });
  expect(tracks[0]?.stop).toHaveBeenCalled();
});

it('leaves no preview track live after a retry that ends in admission', async () => {
  show();
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
  act(() => {
    capture?.handOff();
  });
  // The join failed: the preview comes back with fresh tracks.
  act(() => {
    capture?.reset();
  });
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
  // The stage ends on admission.
  act(() => {
    capture?.finish();
  });
  for (const track of tracks) expect(track.stop).toHaveBeenCalled();
});
