// @vitest-environment jsdom
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { ParticipantTile } from './participant-tile';

const participant = {
  userId: 'peer',
  displayName: 'Peer',
  media: { audioEnabled: true, videoEnabled: false, screenEnabled: true },
} as MeetRealtimePresence;

function setup() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantTile
        participant={participant}
        kind="screen"
        resumePlaybackLabel="Play audio"
      />
    </NextIntlClientProvider>
  );
}

describe('screen share focus view', () => {
  const requestFullscreen = vi.fn(() => Promise.resolve());
  beforeEach(() => {
    vi.useFakeTimers();
    requestFullscreen.mockClear();
    HTMLElement.prototype.requestFullscreen = requestFullscreen;
    document.requestFullscreen = requestFullscreen;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('opens an in-app focus view without browser full screen', () => {
    const { getByLabelText, getByTestId } = setup();
    fireEvent.click(getByLabelText('Focus on screen'));
    expect(requestFullscreen).not.toHaveBeenCalled();
    expect(getByTestId('participant-peer-screen').dataset.focusView).toBe(
      'true'
    );
    expect(document.activeElement).toBe(getByLabelText('Exit focus'));
  });

  it('requests browser full screen on the tile, never the document', () => {
    const { getByLabelText, getByTestId } = setup();
    fireEvent.click(getByLabelText('Focus on screen'));
    fireEvent.click(getByLabelText('Browser full screen'));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(requestFullscreen.mock.contexts[0]).toBe(
      getByTestId('participant-peer-screen')
    );
    expect(requestFullscreen.mock.contexts[0]).not.toBe(document);
  });

  it('stays in focus view when browser full screen is rejected', async () => {
    requestFullscreen.mockImplementationOnce(() =>
      Promise.reject(new Error('denied'))
    );
    const { getByLabelText, getByTestId } = setup();
    fireEvent.click(getByLabelText('Focus on screen'));
    fireEvent.click(getByLabelText('Browser full screen'));
    await act(async () => undefined);
    expect(getByTestId('participant-peer-screen').dataset.focusView).toBe(
      'true'
    );
  });

  it('exits with Esc and returns focus to the tile button', () => {
    const { getByLabelText, getByTestId } = setup();
    fireEvent.click(getByLabelText('Focus on screen'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(getByTestId('participant-peer-screen').dataset.focusView).toBe(
      undefined
    );
    expect(document.activeElement).toBe(getByLabelText('Focus on screen'));
  });

  it('hides controls after idle time and wakes on pointer movement', () => {
    const { getByLabelText, getByTestId } = setup();
    fireEvent.click(getByLabelText('Focus on screen'));
    const bar = () => getByLabelText('Exit focus').parentElement as HTMLElement;
    expect(bar().className).not.toContain('opacity-0');
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(bar().className).toContain('opacity-0');
    fireEvent.pointerMove(getByTestId('participant-peer-screen'));
    expect(bar().className).not.toContain('opacity-0');
  });
});
