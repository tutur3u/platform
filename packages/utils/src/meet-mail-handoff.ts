import { z } from 'zod';
import { getInternalAppDomainByUrl } from './internal-domains';

export const HANDOFF_WINDOW_MS = 5 * 60_000;
export const HANDOFF_FRAGMENT_LIMIT = 16_384;
export const HANDOFF_PREFIX = '#meet-mail=';
const subject = z
  .string()
  .refine((value) => !/[\x00-\x1f\x7f\u2028\u2029]/u.test(value))
  .trim()
  .min(1)
  .max(160);
const schema = z
  .object({
    v: z.literal(1),
    source: z.literal('meet'),
    id: z.uuidv4(),
    issuedAt: z.number().int().positive(),
    actorId: z.guid(),
    workspaceId: z.guid(),
    subject,
    joinUrl: z.string().max(512),
    body: z.string().max(1024),
    to: z
      .array(
        z
          .string()
          .refine((value) => !/[\r\n\x00]/u.test(value))
          .trim()
          .toLowerCase()
          .email()
          .max(320)
      )
      .min(1)
      .max(20),
  })
  .strict();
export type MeetMailHandoff = z.infer<typeof schema>;
export type MeetMailPlainDraft = Pick<MeetMailHandoff, 'to' | 'subject'> & {
  text: string;
};

function registeredOrigin(name: 'mail' | 'meet', configured?: string) {
  const value = configured ? getInternalAppDomainByUrl(configured) : null;
  const selected =
    value?.name === name
      ? value
      : getInternalAppDomainByUrl(`https://${name}.tuturuuu.com`);
  if (!selected || selected.name !== name)
    throw new Error('Handoff origin unavailable');
  return new URL(selected.canonicalUrl).origin;
}
export function meetMailOrigins() {
  return {
    mail: registeredOrigin('mail', process.env.NEXT_PUBLIC_MAIL_APP_URL),
    meet: registeredOrigin('meet', process.env.NEXT_PUBLIC_MEET_APP_URL),
  };
}
export function parseMeetMailHandoff(
  fragment: string,
  scope: {
    actorId: string;
    workspaceId: string;
    meetOrigin: string;
    now?: number;
  }
): MeetMailHandoff | null {
  try {
    if (
      !fragment.startsWith(HANDOFF_PREFIX) ||
      fragment.length > HANDOFF_FRAGMENT_LIMIT
    )
      return null;
    const input: unknown = JSON.parse(
      decodeURIComponent(fragment.slice(HANDOFF_PREFIX.length))
    );
    const result = schema.safeParse(input);
    if (!result.success) return null;
    const value = result.data;
    const now = scope.now ?? Date.now();
    if (
      value.actorId !== scope.actorId ||
      value.workspaceId !== scope.workspaceId ||
      value.issuedAt > now + 30_000 ||
      now - value.issuedAt > HANDOFF_WINDOW_MS
    )
      return null;
    const url = new URL(value.joinUrl);
    if (
      url.href !== value.joinUrl ||
      url.origin !== new URL(scope.meetOrigin).origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/r\/[0-9a-hjkmnp-tv-z]{9}-[0-9a-hjkmnp-tv-z]{9}-[0-9a-hjkmnp-tv-z]{8}$/u.test(
        url.pathname
      )
    )
      return null;
    if (value.body !== `${value.subject}\n${value.joinUrl}`) return null;
    return { ...value, to: [...new Set(value.to)] };
  } catch {
    return null;
  }
}
export function meetMailFragment(value: MeetMailHandoff) {
  const fragment = `${HANDOFF_PREFIX}${encodeURIComponent(JSON.stringify(value))}`;
  if (
    !parseMeetMailHandoff(fragment, {
      ...value,
      meetOrigin: meetMailOrigins().meet,
    })
  )
    throw new Error('Invalid Mail handoff');
  return fragment;
}
export function meetMailUrl(value: MeetMailHandoff, locale: string) {
  if (locale !== 'en' && locale !== 'vi')
    throw new Error('Unsupported handoff locale');
  const url = new URL(
    `/${locale}/${encodeURIComponent(value.workspaceId)}/inbox`,
    meetMailOrigins().mail
  );
  url.hash = meetMailFragment(value);
  return url.href;
}
export function handoffPlainDraft(value: MeetMailHandoff): MeetMailPlainDraft {
  return { to: value.to, subject: value.subject, text: value.body };
}
