// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';
import vi from '../../../../../apps/meet/messages/vi.json';
import {
  hashMiraConsentText,
  MiraConsentBox,
  miraConsentInfoKeys,
  useMiraConsentText,
} from './mira-consent-box';

const m = messages.meet.mira_consent;
// The room-capture notice exactly as it has always been hashed.
const ROOM_KEYS = [
  'info_what',
  'info_controller',
  'info_data',
  'info_readers',
  'info_retention',
  'info_limits',
  'info_sensitive',
  'info_off',
] as const;
const legacyText = [
  m.box_label,
  m.adults,
  ...ROOM_KEYS.map((key) => m[key]),
].join('\n');
const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    {children}
  </NextIntlClientProvider>
);
afterEach(cleanup);

describe('Mira notice per meeting mode', () => {
  it('keeps the room-capture text and hash unchanged', async () => {
    const room = renderHook(() => useMiraConsentText(), { wrapper });
    expect(room.result.current).toBe(legacyText);
    const explicit = renderHook(() => useMiraConsentText('room'), { wrapper });
    expect(await hashMiraConsentText(explicit.result.current)).toBe(
      await hashMiraConsentText(legacyText)
    );
  });

  it('hashes only the per-speaker line in a per-speaker meeting', async () => {
    const self = renderHook(() => useMiraConsentText('self'), { wrapper });
    const text = self.result.current;
    expect(text).toContain(m.info_off_self);
    expect(text).not.toContain(m.info_off);
    expect(text).toBe(legacyText.replace(m.info_off, m.info_off_self));
    expect(await hashMiraConsentText(text)).not.toBe(
      await hashMiraConsentText(legacyText)
    );
    expect(miraConsentInfoKeys('self')).toHaveLength(ROOM_KEYS.length);
  });

  it.each([
    ['room', m.info_off, m.info_off_self],
    ['self', m.info_off_self, m.info_off],
  ] as const)(
    'shows the %s turning-off line only',
    async (mode, shown, hidden) => {
      render(
        <MiraConsentBox
          id="box"
          checked
          onCheckedChange={() => undefined}
          mode={mode}
        />,
        { wrapper }
      );
      fireEvent.click(screen.getByRole('button', { name: m.info_button }));
      expect(await screen.findByText(shown)).toBeTruthy();
      expect(screen.queryByText(hidden)).toBeNull();
    }
  );

  it('has the per-speaker line in Vietnamese too', () => {
    expect(vi.meet.mira_consent.info_off_self).toBeTruthy();
    expect(vi.meet.mira_consent.info_off_self).not.toBe(m.info_off_self);
  });
});
