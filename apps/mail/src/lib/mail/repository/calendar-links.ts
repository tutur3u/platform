import { getCalendarEventLinkPreview } from '@tuturuuu/internal-api/calendar';
import {
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api/client';
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import {
  type CalendarLinkDependencies,
  createCalendarLinkService,
} from '../calendar-link';
import { projectMailCalendarTarget } from '../calendar-link-adapter';
import {
  readCalendarAssociation,
  updateCalendarAssociation,
} from '../calendar-link-storage';
import type { MailRouteContext } from '../types';
import { requireMailboxAccess } from './bootstrap';
import { getMailInvitation } from './calendar';
import { mailMessageTable } from './shared';

/** Metadata belongs to the original Mail message. Calendar tables are never accessed. */
export function mailCalendarLinks(
  ctx: MailRouteContext,
  headers: Headers,
  mailboxId: string,
  messageId: string
) {
  const baseUrl = resolveInternalAppUrl({
    appName: 'calendar',
    candidates: [
      process.env.CALENDAR_APP_URL,
      process.env.NEXT_PUBLIC_CALENDAR_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://calendar.tuturuuu.com'
        : 'https://calendar.tuturuuu.localhost',
  });
  const calendarOrigin = resolveInternalAppUrl({
    appName: 'calendar',
    candidates: [process.env.NEXT_PUBLIC_CALENDAR_APP_URL],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://calendar.tuturuuu.com'
        : 'https://calendar.tuturuuu.localhost',
  });
  const url = new URL(baseUrl);
  if (
    url.protocol !== 'https:' &&
    !(
      process.env.NODE_ENV !== 'production' &&
      (url.hostname.endsWith('.localhost') ||
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  )
    throw new Error('Calendar requires a secure origin');
  const options = withForwardedInternalApiAuth(headers, { baseUrl });
  async function sourceMetadata() {
    const access = await requireMailboxAccess(ctx, mailboxId, [
      'owner',
      'admin',
      'sender',
    ]);
    if (!access || access.mailbox.groupPolicy) return null;
    const { data, error } = await mailMessageTable(access, ctx)
      .select('metadata')
      .eq('id', messageId)
      .eq('mailbox_id', mailboxId)
      .maybeSingle();
    if (error) throw new Error('Failed to read Calendar association');
    return data ? { access, metadata: data.metadata } : null;
  }
  const deps: CalendarLinkDependencies = {
    readInvitation: async (actor, box, message) => {
      if (actor !== ctx.user.id || box !== mailboxId || message !== messageId)
        return null;
      return (
        (await getMailInvitation(ctx, mailboxId, messageId))?.invitation ?? null
      );
    },
    readTarget: async (actor, workspace, event) => {
      if (actor !== ctx.user.id) return null;
      try {
        return projectMailCalendarTarget(
          actor,
          workspace,
          event,
          await getCalendarEventLinkPreview(workspace, event, options),
          calendarOrigin
        );
      } catch (error) {
        if (
          error instanceof InternalApiError &&
          [401, 403, 404].includes(error.status)
        )
          return null;
        throw new Error('Calendar preview unavailable');
      }
    },
    readAssociation: async (actor, key) => {
      if (actor !== ctx.user.id) return null;
      const source = await sourceMetadata();
      return source
        ? readCalendarAssociation(source.metadata, actor, key)
        : null;
    },
    saveAssociation: async (actor, key, expected, next) => {
      if (
        actor !== ctx.user.id ||
        !(await deps.readInvitation(actor, mailboxId, messageId))
      )
        return false;
      const source = await sourceMetadata();
      if (!source) return false;
      const updated = updateCalendarAssociation(
        source.metadata,
        actor,
        key,
        expected,
        next
      );
      if (!updated) return false;
      let query = mailMessageTable(source.access, ctx)
        .update({ metadata: updated })
        .eq('id', messageId)
        .eq('mailbox_id', mailboxId);
      query =
        source.metadata === null
          ? query.is('metadata', null)
          : query.eq('metadata', JSON.stringify(source.metadata));
      const { data, error } = await query.select('id').maybeSingle();
      if (error) throw new Error('Failed to save Calendar association');
      return Boolean(data);
    },
  };
  return {
    service: createCalendarLinkService(deps),
    readAssociation: deps.readAssociation,
  };
}
