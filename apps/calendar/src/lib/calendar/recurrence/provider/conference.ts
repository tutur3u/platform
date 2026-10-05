import { createHash } from 'node:crypto';
import { decodeHTML } from 'entities';
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
  const strings: string[] = [];
  const serialized = JSON.stringify(fields, (_key, value: unknown) => {
    if (typeof value === 'string') strings.push(value);
    return value;
  });
  const variants = [serialized, ...strings].flatMap((value) => {
    const html = decodeHTML(value);
    const percent = decodePercentRuns(value);
    return [
      value,
      html,
      percent,
      decodePercentRuns(html),
      decodeHTML(percent),
    ].flatMap((text) => [text, comparisonUrlText(text)]);
  });
  const conferenceId = conference?.conferenceId;
  if (
    links.some(
      (value) =>
        typeof value === 'string' &&
        variants.some((content) =>
          content.toLowerCase().includes(joinIdentity(value))
        )
    ) ||
    (typeof conferenceId === 'string' &&
      conferenceId.length > 0 &&
      variants.some((content) => content.includes(conferenceId)))
  )
    throw new RangeError('Future split body embeds the original meeting link');
}

/** Decode valid URI runs independently: an unrelated malformed escape must not
 * suppress credential detection elsewhere. Invalid UTF-8 retains its bytes,
 * while recoverable ASCII escapes in that run still participate in matching. */
function decodePercentRuns(value: string) {
  return value.replace(/(?:%[a-f\d]{2})+/gi, (encoded) => {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded.replace(/%([0-7][a-f\d])/gi, (_, byte: string) =>
        String.fromCharCode(Number.parseInt(byte, 16))
      );
    }
  });
}

/** Mirror browser URL normalization only in the comparison copy. Captured raw
 * string values keep literal controls/backslashes out of JSON escape syntax. */
function comparisonUrlText(value: string) {
  return value
    .replace(/[\t\n\r]/g, '')
    .replace(/(?:https?:|[/\\]{2})[^\s"'<>]+/gi, (candidate) => {
      try {
        const absolute = /^https?:/i.test(candidate)
          ? candidate
          : `https:${candidate.replaceAll('\\', '/')}`;
        return joinIdentity(absolute);
      } catch {
        return candidate;
      }
    });
}
