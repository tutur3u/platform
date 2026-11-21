'use client';

import { useQuery } from '@tanstack/react-query';
import {
  createWorkspaceMeetingShortLink,
  getWorkspaceMeetingShortLinks,
  InternalApiError,
  type MeetShortLink,
  type MeetShortLinksState,
} from '@tuturuuu/internal-api';

export function meetingShortLinksKey(wsId: string, meetingId: string) {
  return ['meeting-short-links', wsId, meetingId] as const;
}

/**
 * Load the meeting's share links. An eligible meeting always asks for its
 * generated link, which creates it on first use and renews its expiry, so
 * the share surface shows ttr.gg whenever the plan allows it. A failed
 * request keeps the canonical link.
 */
export async function loadMeetingShortLinks(
  wsId: string,
  meetingId: string
): Promise<MeetShortLinksState> {
  const state = await getWorkspaceMeetingShortLinks(wsId, meetingId);
  if (!state.eligible) return state;
  try {
    const { link } = await createWorkspaceMeetingShortLink(wsId, meetingId, {
      kind: 'generated',
    });
    return {
      ...state,
      links: [link, ...state.links.filter((item) => item.id !== link.id)],
    };
  } catch {
    return state;
  }
}

export function useMeetingShortLinks(
  wsId: string,
  meetingId: string,
  enabled: boolean
) {
  return useQuery({
    queryKey: meetingShortLinksKey(wsId, meetingId),
    queryFn: () => loadMeetingShortLinks(wsId, meetingId),
    enabled,
    staleTime: 60_000,
  });
}

/** The generated link, only while the meeting may use short links. */
export function generatedLink(
  state: MeetShortLinksState | undefined
): MeetShortLink | undefined {
  return state?.eligible
    ? state.links.find((link) => link.kind === 'generated')
    : undefined;
}

/** Display form without the scheme: `ttr.gg/meet/Ab3dE9x`. */
export function displayLink(url: string) {
  return url.replace(/^https?:\/\//, '');
}

export type ShortLinkErrorKey =
  | 'taken'
  | 'reserved_slug'
  | 'invalid_slug'
  | 'rate_limited'
  | 'vanity_limit'
  | 'staff_only'
  | 'unavailable';

const ERROR_KEYS = new Set<string>([
  'taken',
  'reserved_slug',
  'invalid_slug',
  'rate_limited',
  'vanity_limit',
  'staff_only',
]);

export function shortLinkErrorKey(error: unknown): ShortLinkErrorKey {
  const code = error instanceof InternalApiError ? error.code : undefined;
  return typeof code === 'string' && ERROR_KEYS.has(code)
    ? (code as ShortLinkErrorKey)
    : 'unavailable';
}
