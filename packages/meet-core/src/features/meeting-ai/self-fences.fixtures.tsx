import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';
import { miraConsentInfoKeys } from '../live-assistant/mira-consent-box';

/** Shared fixtures for the per-speaker consent and Mira fence tests. */
export const ai = messages.meet.ai;
export const mc = messages.meet.mira_consent;
export const miraText = (mode: 'room' | 'self') =>
  [
    mc.box_label,
    mc.adults,
    ...miraConsentInfoKeys(mode).map((key) => mc[key]),
  ].join('\n');
export const view = (over: object = {}) => ({
  available: true,
  version: 'notice-v2',
  choice: 'allow',
  fence: { ready: false, pending: 1, declined: 1, admitted: 3 },
  active: true,
  activeSince: 1,
  mode: 'self',
  perSpeakerAvailable: true,
  canManageMode: false,
  session: { sessionId: 'session-1', protocol: 'self_v1' },
  ...over,
});
export const miraOn = {
  available: true,
  version: 'v',
  acceptance: {
    revision: 1,
    acceptorName: 'Lan',
    capabilities: ['chat'],
    acceptedAt: 0,
  },
  choice: 'on',
  lastChoice: 'on',
  pausing: false,
  ready: true,
  canAccept: false,
  status: { active: true, included: 1, admitted: 2 },
  boxTickedByDefault: true,
};
const track = {
  readyState: 'live',
  getSettings: () => ({ echoCancellation: true }),
  stop: vi.fn(),
} as unknown as MediaStreamTrack;
export const room = {
  localStream: { getAudioTracks: () => [track] } as unknown as MediaStream,
  connectionStatus: 'open',
  state: { participants: {} },
};
export const grant = () => ({
  streamId: 'stream-1',
  consentRevision: 2,
  leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
});
export const conflict = (code: string) =>
  Object.assign(new Error(code), { status: 409, code });

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
