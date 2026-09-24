// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, expect, it } from 'vitest';
import { setReceiverPacketState } from '../lib/receiver-packet-state';
import { useStreamReadiness } from './media-receiving-status';

afterEach(cleanup);
it('shows decoded media when unmute occurs between render and subscription', () => {
  const track = Object.assign(new EventTarget(), {
    id: 'video',
    kind: 'video',
    readyState: 'live',
    muted: true,
  });
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
  function Tile() {
    const ready = useStreamReadiness(stream);
    useLayoutEffect(() => {
      track.muted = false;
      track.dispatchEvent(new Event('unmute'));
      setReceiverPacketState(track as unknown as MediaStreamTrack, true);
    }, []);
    return <p>{ready.video ? 'video visible' : 'avatar only'}</p>;
  }
  render(<Tile />);
  expect(screen.getByText('video visible')).toBeTruthy();
});
