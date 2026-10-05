import { createHash } from 'node:crypto';
import { z } from 'zod';

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const joinIdentity = (value: string) => {
  const url = new URL(value);
  return `${url.origin}${decodeURIComponent(url.pathname)}`.toLowerCase();
};
const provider = z.enum([
  'teamsForBusiness',
  'skypeForBusiness',
  'skypeForConsumer',
]);
const httpsUrl = z
  .string()
  .max(8192)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  });
export const GoogleConferenceCreateSchema = z
  .object({
    createRequest: z
      .object({
        requestId: z.string().regex(/^[a-f0-9]{64}$/),
        conferenceSolutionKey: z
          .object({ type: z.literal('hangoutsMeet') })
          .strict(),
      })
      .strict(),
  })
  .strict();
export const GraphMeetingProviderSchema = provider;
export function freshProviderConference(
  providerName: 'google' | 'microsoft',
  master: Record<string, unknown>,
  operationId?: string
) {
  if (providerName === 'google') {
    if (!master.conferenceData && !master.hangoutLink) return null;
    if (!operationId)
      throw new RangeError('Fresh conference operation identity required');
    const conference = z
      .object({
        conferenceId: z.string().min(1),
        conferenceSolution: z.object({
          key: z.object({ type: z.literal('hangoutsMeet') }),
        }),
      })
      .parse(master.conferenceData);
    const joinUrl = httpsUrl.parse(master.hangoutLink);
    if (new URL(joinUrl).hostname !== 'meet.google.com')
      throw new RangeError('Unsupported Google meeting provider');
    return {
      excludedConferenceHash: hash(conference.conferenceId),
      excludedJoinHash: hash(joinIdentity(joinUrl)),
      fields: {
        conferenceData: {
          createRequest: {
            requestId: hash(`conference:${operationId}`),
            conferenceSolutionKey: { type: 'hangoutsMeet' as const },
          },
        },
      },
    };
  }
  if (
    !master.isOnlineMeeting &&
    !master.onlineMeeting &&
    !master.onlineMeetingUrl
  )
    return null;
  if (!operationId || master.isOnlineMeeting !== true)
    throw new RangeError('Fresh conference operation identity required');
  const meetingProvider = provider.parse(master.onlineMeetingProvider);
  const meeting = z.object({ joinUrl: httpsUrl }).parse(master.onlineMeeting);
  return {
    excludedConferenceHash: hash(joinIdentity(meeting.joinUrl)),
    excludedJoinHash: hash(joinIdentity(meeting.joinUrl)),
    fields: {
      isOnlineMeeting: true as const,
      onlineMeetingProvider: meetingProvider,
    },
  };
}

/** Conference creation is asynchronous. Never checkpoint the replacement until
 * its fresh join identity is available; retry reads the same retained event. */
export function verifyFreshProviderConference(
  providerName: 'google' | 'microsoft',
  event: Record<string, unknown>,
  excludedHash?: string,
  excludedJoinHash?: string,
  expectedMeetingProvider?: string
) {
  if (!excludedHash) return;
  if (providerName === 'google') {
    const conference = z
      .object({
        conferenceId: z.string().min(1),
        createRequest: z.object({
          status: z.object({ statusCode: z.literal('success') }),
        }),
        conferenceSolution: z.object({
          key: z.object({ type: z.literal('hangoutsMeet') }),
        }),
      })
      .safeParse(event.conferenceData);
    if (!conference.success)
      throw new Error('Fresh Google conference is not ready');
    const url = httpsUrl.safeParse(event.hangoutLink);
    if (
      !url.success ||
      new URL(url.data).hostname !== 'meet.google.com' ||
      hash(conference.data.conferenceId) === excludedHash ||
      (excludedJoinHash !== undefined &&
        hash(joinIdentity(url.data)) === excludedJoinHash)
    )
      throw new Error('Fresh Google conference identity unavailable');
    return;
  }
  const meeting = z
    .object({ joinUrl: httpsUrl })
    .safeParse(event.onlineMeeting);
  if (
    event.isOnlineMeeting !== true ||
    !provider.safeParse(event.onlineMeetingProvider).success ||
    (expectedMeetingProvider !== undefined &&
      event.onlineMeetingProvider !== expectedMeetingProvider) ||
    !meeting.success ||
    hash(joinIdentity(meeting.data.joinUrl)) === excludedHash
  )
    throw new Error('Fresh Outlook conference is not ready');
}

/** A fresh meeting must not carry the original provider's join credentials in
 * copied body/description metadata. Generated HTML blobs cannot be safely
 * stripped while preserving arbitrary user content, so reject before reserve. */
export function assertNoCopiedConferenceLink(
  master: Record<string, unknown>,
  fields: Record<string, unknown>
) {
  const online = master.onlineMeeting as { joinUrl?: unknown } | undefined;
  const conference = master.conferenceData as
    | { conferenceId?: unknown }
    | undefined;
  const links = [master.hangoutLink, online?.joinUrl, master.onlineMeetingUrl];
  let serialized = JSON.stringify(fields).replace(/&amp;/gi, '&');
  try {
    serialized = decodeURIComponent(serialized);
  } catch {
    // Literal malformed percent sequences do not make raw links safe.
  }
  if (
    links.some(
      (value) =>
        typeof value === 'string' &&
        serialized.toLowerCase().includes(joinIdentity(value))
    ) ||
    (typeof conference?.conferenceId === 'string' &&
      conference.conferenceId.length > 0 &&
      serialized.includes(conference.conferenceId))
  )
    throw new RangeError('Future split body embeds the original meeting link');
}
