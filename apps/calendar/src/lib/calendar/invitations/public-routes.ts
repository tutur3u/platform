import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import { checkRateLimit } from '@/lib/rate-limit';
import { hashInviteToken, isWellFormedInviteToken } from './tokens';
import {
  applyRsvp,
  applyUnsubscribe,
  lookupInviteToken,
  type RsvpResponse,
} from './public-actions';
import {
  eventSummaryHtml,
  fillCopy,
  hiddenField,
  publicCopy,
  publicPageLocale,
  renderPublicPage,
} from './public-page';

const RSVP_VALUES = new Set<RsvpResponse>([
  'accepted',
  'declined',
  'tentative',
]);

/**
 * Unauthenticated link limits. A POST with a well-formed token is limited
 * per token, so one-click unsubscribes from shared mailbox-provider IPs are
 * never starved; everything else is limited per client IP.
 */
async function publicLimit(request: Request, bucket: string, token: unknown) {
  const key =
    request.method === 'POST' && isWellFormedInviteToken(token)
      ? `token:${hashInviteToken(token)}`
      : `ip:${extractIPFromHeaders(request.headers)}`;
  const result = await checkRateLimit(`calendar:invite-link:${bucket}:${key}`, {
    windowMs: 60_000,
    maxRequests: 20,
  });
  return 'allowed' in result;
}

async function readForm(request: Request) {
  const type = request.headers.get('content-type') ?? '';
  if (
    !type.includes('application/x-www-form-urlencoded') &&
    !type.includes('multipart/form-data')
  )
    return new URLSearchParams();
  const text = await request.text().catch(() => '');
  return new URLSearchParams(text.slice(0, 4096));
}

function rsvpButtons(
  token: string,
  selected: string | null,
  locale: 'en' | 'vi'
) {
  const copy = publicCopy(locale);
  const option = (value: RsvpResponse, label: string) =>
    `<form method="post">${hiddenField('token', token)}${hiddenField('response', value)}<button type="submit"${
      selected === value ? ' class="primary"' : ''
    }>${label}</button></form>`;
  return `<p><strong>${copy.going}</strong></p><p>${option('accepted', copy.yes)}${option(
    'tentative',
    copy.maybe
  )}${option('declined', copy.no)}</p>`;
}

/**
 * GET never writes: mail scanners prefetch links, so the page asks the
 * recipient to confirm with a POST. Nothing about the event is shown for an
 * invalid or expired token.
 */
export async function handleRsvp(
  request: Request,
  sbAdmin: () => Promise<TypedSupabaseClient>
) {
  const locale = publicPageLocale(request);
  const copy = publicCopy(locale);

  const url = new URL(request.url);
  const form = request.method === 'POST' ? await readForm(request) : null;
  const token = form?.get('token') ?? url.searchParams.get('token');
  const response = form?.get('response') ?? url.searchParams.get('response');
  if (!(await publicLimit(request, 'rsvp', token)))
    return renderPublicPage({
      locale,
      title: copy.rsvpTitle,
      body: `<p>${copy.limited}</p>`,
      status: 429,
    });

  const client = await sbAdmin();
  const lookup = await lookupInviteToken(client, token, 'rsvp');
  if (!lookup.ok)
    return renderPublicPage({
      locale,
      title: copy.rsvpTitle,
      body: `<p>${copy.invalid}</p>`,
      status: 404,
    });

  const summary = eventSummaryHtml(lookup.event, locale);
  if (
    request.method === 'POST' &&
    response &&
    RSVP_VALUES.has(response as RsvpResponse)
  ) {
    await applyRsvp(client, lookup, response as RsvpResponse);
    const label = copy[response as RsvpResponse];
    return renderPublicPage({
      locale,
      title: copy.rsvpTitle,
      body: `${summary}<p>${fillCopy(copy.saved, { response: label })}</p>${rsvpButtons(
        token as string,
        response,
        locale
      )}`,
    });
  }

  const preselected =
    response && RSVP_VALUES.has(response as RsvpResponse)
      ? response
      : (lookup.guest?.rsvp_status ?? null);
  return renderPublicPage({
    locale,
    title: copy.rsvpTitle,
    body: `${summary}${rsvpButtons(token as string, preselected, locale)}`,
  });
}

/**
 * GET shows a confirmation; POST applies it. A POST with
 * `List-Unsubscribe=One-Click` (RFC 8058) unsubscribes from mail clients.
 */
export async function handleUnsubscribe(
  request: Request,
  sbAdmin: () => Promise<TypedSupabaseClient>
) {
  const locale = publicPageLocale(request);
  const copy = publicCopy(locale);

  const url = new URL(request.url);
  const form = request.method === 'POST' ? await readForm(request) : null;
  const token = form?.get('token') ?? url.searchParams.get('token');
  const scopeParam = form?.get('scope') ?? url.searchParams.get('scope');
  const scope = scopeParam === 'sender' ? 'sender' : 'all';
  if (!(await publicLimit(request, 'unsubscribe', token)))
    return renderPublicPage({
      locale,
      title: copy.unsubscribeTitle,
      body: `<p>${copy.limited}</p>`,
      status: 429,
    });

  const client = await sbAdmin();
  const lookup = await lookupInviteToken(client, token, 'unsubscribe');
  if (!lookup.ok)
    return renderPublicPage({
      locale,
      title: copy.unsubscribeTitle,
      body: `<p>${copy.invalid}</p>`,
      status: 404,
    });

  if (request.method === 'POST') {
    const applied = await applyUnsubscribe(client, lookup, scope);
    return renderPublicPage({
      locale,
      title: copy.unsubscribeTitle,
      body: `<p>${fillCopy(
        applied === 'sender' ? copy.blocked : copy.unsubscribed,
        {
          email: lookup.email,
        }
      )}</p>`,
    });
  }

  const organizer = lookup.event?.organizer ?? '';
  const choice = (value: 'all' | 'sender', label: string, primary: boolean) =>
    `<form method="post">${hiddenField('token', token as string)}${hiddenField('scope', value)}<button type="submit"${
      primary ? ' class="primary"' : ''
    }>${label}</button></form>`;
  return renderPublicPage({
    locale,
    title: copy.unsubscribeTitle,
    body: `<h1>${copy.unsubscribeTitle}</h1><p>${
      lookup.organizerUserId
        ? choice(
            'sender',
            fillCopy(copy.blockSender, { name: organizer }),
            scope === 'sender'
          )
        : ''
    }</p><p>${choice('all', fillCopy(copy.unsubscribeAll, { email: lookup.email }), scope === 'all')}</p>`,
  });
}
