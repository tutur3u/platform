// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import messages from '../../../../messages/en.json';
import {
  PlaybackVolumeControl,
  PlaybackVolumeProvider,
  usePlaybackVolume,
} from './playback-volume';

function Levels() {
  const peer = usePlaybackVolume('peer');
  const other = usePlaybackVolume('other');
  const mira = usePlaybackVolume('mira');
  return <output>{`${peer}/${other}/${mira}`}</output>;
}
afterEach(cleanup);
it('combines master and independent participant/Mira volume without changing other listeners', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PlaybackVolumeProvider>
        <PlaybackVolumeControl
          selfUserId="self"
          participants={[
            { userId: 'peer', displayName: 'Peer' } as MeetRealtimePresence,
          ]}
        />
        <Levels />
      </PlaybackVolumeProvider>
    </NextIntlClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Playback volume' }));
  fireEvent.change(screen.getByRole('slider', { name: 'Master volume' }), {
    target: { value: '50' },
  });
  fireEvent.change(screen.getByRole('slider', { name: 'Peer volume' }), {
    target: { value: '40' },
  });
  fireEvent.change(screen.getByRole('slider', { name: 'Mira voice volume' }), {
    target: { value: '20' },
  });
  expect(screen.getByText('0.2/0.5/0.1')).toBeTruthy();
  fireEvent.change(screen.getByRole('slider', { name: 'Master volume' }), {
    target: { value: '0' },
  });
  expect(screen.getByText('0/0/0')).toBeTruthy();
  fireEvent.change(screen.getByRole('slider', { name: 'Master volume' }), {
    target: { value: '100' },
  });
  expect(screen.getByText('0.4/1/0.2')).toBeTruthy();
});
