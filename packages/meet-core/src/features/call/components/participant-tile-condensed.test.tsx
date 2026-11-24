import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { ParticipantTile } from './participant-tile';

const participant = {
  userId: 'me',
  displayName: 'Nguyễn Minh Anh',
  media: { audioEnabled: true, videoEnabled: false, screenEnabled: false },
} as MeetRealtimePresence;

function html(props: { condensed?: boolean; isSelf?: boolean }) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantTile
        participant={participant}
        resumePlaybackLabel="Play meeting audio"
        {...props}
      />
    </NextIntlClientProvider>
  );
}

it('shows only "You" on the local filmstrip tile, with no suffix or clipped name', () => {
  const markup = html({ condensed: true, isSelf: true });
  expect(markup).toContain('>You<');
  // The full name stays available as the tooltip, never as visible text.
  expect(markup).not.toContain('>Nguyễn Minh Anh<');
  expect(markup).not.toContain('· You');
});

it('keeps the full local label and the other names outside the filmstrip', () => {
  const markup = html({ isSelf: true });
  expect(markup).toContain('>Nguyễn Minh Anh<');
  expect(markup).toContain('· You');
  expect(html({ condensed: true })).toContain('>Nguyễn Minh Anh<');
});
