import { isMeetClassroomEnabled } from '@/features/classroom-tools/access.server';
import '@tanstack/react-start/server-only';
import { notFound, redirect } from '@tanstack/react-router';
import {
  getMeetPlanSnapshot,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import {
  getMeetCallAccess,
  MeetCallAccessError,
} from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  getMeetGuestCallAccess,
  meetGuestTurnstileSiteKey,
  resolveMeetGuestJoin,
} from '@tuturuuu/meet-core/features/call/lib/guest-access';
import { buildMeetSeo } from '@tuturuuu/meet-core/features/call/lib/seo/metadata';
import { MEET_GUEST_COOKIE } from '@tuturuuu/meet-core/features/call/lib/guest-session';
import { getHostMeetingDurationSeconds } from '@tuturuuu/meet-core/features/call/lib/meeting-duration';
import {
  type MeetingPublicInfo,
  resolveMeetingPublicInfo,
} from '@tuturuuu/meet-core/features/call/lib/meeting-public-info';
import { decodeRoomCode } from '@tuturuuu/meet-core/features/call/lib/room-code';
import { readMeetingRoomPolicy } from '@tuturuuu/meet-core/features/meeting-ai/server/room-access';
import { isMeetFormsEnabled } from '@tuturuuu/meet-core/features/call/server/forms/enabled';
import { isParleySession } from '@tuturuuu/meet-core/parley/repository';
import {
  getSatelliteAppSessionUser,
  getSatelliteCurrentUser,
} from '@tuturuuu/satellite/auth';
import { getPendingWorkspaceInvitation } from '@tuturuuu/satellite/workspace-invitation';
import {
  getSidebarBehaviorUpdatedAt,
  getSidebarCollapsedState,
  parseSidebarBehavior,
} from '@tuturuuu/satellite/workspace-layout-helpers';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import type { getMeetTogetherPlansData } from '@tuturuuu/ui/legacy/meet/page';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { canVerifiedAccountHostMeeting } from '@tuturuuu/utils/meet-hosting';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { loadMeetingCalendarEvent } from '../app/[locale]/[wsId]/meetings/[meetingId]/meeting-calendar-event';
import { getMeetWorkspaceContext } from '../app/[locale]/[wsId]/workspace-context';
import { markSignedInDocument } from './document-cache';
import { getLocale, getTranslations } from './intl-server';
import type { MeetPageMeta } from './page-head';
import { meetPlanPolls } from './plan-polls';
import {
  cookies,
  headers,
  meetRequest,
  withMeetRequest,
} from './request-context';
import { recordMeetPhase, timeMeetPhase } from './ssr-timing';

/**
 * The public preview and the call access check read the same meeting row and
 * Parley flag, so each is fetched once. The host's room policy is shared too:
 * when the viewer is the host, their own policy read is the same signed request.
 */
function roomSources(meetingId: string) {
  const loadMeeting = async () =>
    (await createAdminClient({ noCookie: true }))
      .from('workspace_meetings')
      .select('id, name, creator_id, ws_id, time, workspaces(personal)')
      .eq('id', meetingId)
      .maybeSingle();
  let meeting: ReturnType<typeof loadMeeting> | undefined;
  const parley = new Map<boolean, Promise<boolean>>();
  let hostPolicy: ReturnType<typeof readMeetingRoomPolicy> | undefined;
  return {
    meeting: () => (meeting ??= loadMeeting()),
    isParleySession: (required = false) => {
      const pending =
        parley.get(required) ?? isParleySession(meetingId, required);
      parley.set(required, pending);
      return pending;
    },
    hostPolicy: (host: { ws_id: string; creator_id: string }) =>
      (hostPolicy ??= readMeetingRoomPolicy({
        meetingId,
        wsId: host.ws_id,
        userId: host.creator_id,
        isHost: true,
      })),
  };
}

async function roomModel(code: string, locale: string, url: URL) {
  const meetingId = decodeRoomCode(code);
  if (!meetingId) throw notFound();
  const t = await getTranslations('meet.call');
  const sources = roomSources(meetingId);
  // Never rejects: any lookup failure keeps the meeting private.
  const infoPromise = resolveMeetingPublicInfo({
    ...sources,
    isParleySession: () => sources.isParleySession(false),
  });
  const roomMeta = (info: MeetingPublicInfo | null): MeetPageMeta =>
    buildMeetSeo({ kind: 'room', code, info }, locale);
  const guestSources = {
    ...sources,
    isParleySession: () => sources.isParleySession(false),
  };
  const access = await getMeetCallAccess(meetingId, t('guest'), sources)
    .then((signedIn) => ({ ...signedIn, guest: false as const }))
    .catch(async (error: unknown) => {
      if (error instanceof MeetCallAccessError) {
        if (error.status === 401) {
          const guest = await getMeetGuestCallAccess(
            meetingId,
            (await cookies()).get(MEET_GUEST_COOKIE)?.value,
            guestSources
          );
          if (guest) {
            // Guest HTML carries a per-browser identity; never cache it.
            markSignedInDocument();
            return guest;
          }
          const info = await infoPromise;
          const returnTo = `${locale === 'en' ? '' : `/${locale}`}/r/${code}`;
          const siteKey = meetGuestTurnstileSiteKey();
          if (
            siteKey &&
            (await resolveMeetGuestJoin(meetingId, guestSources)).kind ===
              'available'
          ) {
            // Guest join follows live host settings; never serve a stale copy.
            markSignedInDocument();
            return { guestJoin: { meetingId, siteKey }, returnTo, info };
          }
          if (info) return { publicInvite: info, returnTo, info };
          return { accountRequired: true as const, returnTo };
        }
        if (error.status === 403 || error.status === 404) throw notFound();
      }
      throw error;
    });
  if ('guestJoin' in access && access.guestJoin) {
    const { info, guestJoin, returnTo } = access;
    return {
      kind: 'guest-join' as const,
      meetingId: guestJoin.meetingId,
      siteKey: guestJoin.siteKey,
      // Lets the join page server-render the Turnstile script under the
      // response's CSP nonce, so it loads while the page hydrates.
      scriptNonce: globalThis.__meetCspNonce?.(),
      meetingTitle: info?.title,
      returnTo,
      meta: roomMeta(info),
    };
  }
  if ('publicInvite' in access && access.publicInvite) {
    const { info, ...invite } = access;
    return { kind: 'public-invite' as const, ...invite, meta: roomMeta(info) };
  }
  if ('accountRequired' in access) {
    return {
      kind: 'account-required' as const,
      returnTo: access.returnTo,
      meta: roomMeta(null),
    };
  }
  const [info, policy, classroomToolsEnabled] = await Promise.all([
    infoPromise,
    access.isHost
      ? sources.hostPolicy(access.meeting)
      : readMeetingRoomPolicy({
          meetingId,
          wsId: access.meeting.ws_id,
          userId: access.user.id,
          isHost: access.isHost,
        }),
    isMeetClassroomEnabled(access.meeting.ws_id),
  ]);
  return {
    kind: 'room' as const,
    formsEnabled: !access.guest && isMeetFormsEnabled(),
    formsTurnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim(),
    meta: roomMeta(info),
    access: {
      ...access,
      user: { id: access.user.id },
      meeting: {
        id: access.meeting.id,
        name: access.meeting.name,
        ws_id: access.meeting.ws_id,
      },
    },
    policy,
    classroomToolsEnabled,
    initialShowNotes: url.searchParams.get('notes') === '1',
  };
}

async function workspaceModel(id: string) {
  // Personal workspaces cannot receive invitations. For other workspaces,
  // start the invitation check alongside the independent reads.
  const invitationPromise =
    id === 'personal'
      ? Promise.resolve(null)
      : timeMeetPhase(
          'invitation',
          headers().then((requestHeaders) =>
            getPendingWorkspaceInvitation(id, requestHeaders)
          )
        );
  const userPromise = timeMeetPhase(
    'profile',
    getSatelliteCurrentUser('meet').catch(() => null)
  );
  const contextPromise = timeMeetPhase('context', getMeetWorkspaceContext(id));
  contextPromise.catch(() => undefined);
  const invitation = await invitationPromise.catch(async (error: unknown) => {
    await Promise.allSettled([userPromise, contextPromise]);
    throw error;
  });
  if (invitation) return { kind: 'invitation' as const, invitation };
  const context = await contextPromise.catch(async (error: unknown) => {
    await userPromise;
    throw error;
  });
  const cookieStore = await cookies();
  const behavior = parseSidebarBehavior(cookieStore);
  const user = await userPromise;
  return {
    kind: 'workspace' as const,
    ...context,
    user: { id: context.user.id },
    profile: user,
    behavior,
    behaviorUpdatedAt: getSidebarBehaviorUpdatedAt(cookieStore),
    defaultCollapsed: getSidebarCollapsedState(cookieStore, behavior),
  };
}

async function hostingModel(accountId: string) {
  const admin = await createAdminClient({ noCookie: true });
  const { data: identity, error } =
    await admin.auth.admin.getUserById(accountId);
  let unavailable = Boolean(error);
  const canCreate =
    !error &&
    (await canVerifiedAccountHostMeeting(accountId, identity.user).catch(() => {
      unavailable = true;
      return false;
    }));
  return { canCreate, unavailable };
}

async function detailModel(
  workspace: { wsId: string; user: { id: string } },
  meetingId: string
) {
  const { wsId, user } = workspace;
  const supabase = await createAdminClient({ noCookie: true });
  const { data: meeting, error } = await supabase
    .from('workspace_meetings')
    .select('*, creator:users!workspace_meetings_creator_id_fkey(display_name)')
    .eq('id', meetingId)
    .eq('ws_id', wsId)
    .single();
  if (error || !meeting) throw notFound();
  const isHost = meeting.creator_id === user.id;
  // Policy, permissions, the calendar link and the duration limit are
  // independent reads; they resolve together. Errors keep their old order:
  // policy first, then permissions, calendar event and duration.
  const permissionsPromise = getPermissions({ user, wsId });
  const calendarPromise = permissionsPromise.then((permissions) =>
    loadMeetingCalendarEvent({ supabase, permissions, wsId, meetingId })
  );
  const durationPromise = getHostMeetingDurationSeconds(meeting.creator_id);
  const pending = [permissionsPromise, calendarPromise, durationPromise];
  for (const promise of pending) promise.catch(() => undefined);
  const settleThenThrow = async (error: unknown): Promise<never> => {
    await Promise.allSettled(pending);
    throw error;
  };
  const policy = await readMeetingRoomPolicy({
    meetingId,
    wsId,
    userId: user.id,
    isHost,
  }).catch(settleThenThrow);
  if (policy.ended) return { kind: 'ended' as const, meeting, isHost, policy };
  await permissionsPromise.catch(settleThenThrow);
  const calendarEvent = await calendarPromise.catch(settleThenThrow);
  const durationSeconds = await durationPromise;
  return {
    kind: 'active' as const,
    meeting,
    isHost,
    policy,
    calendarEvent,
    durationSeconds,
  };
}

function pagination(url: URL, defaultSize: number) {
  return {
    page: Number.parseInt(url.searchParams.get('page') || '1', 10),
    pageSize: Number.parseInt(
      url.searchParams.get('pageSize') || String(defaultSize),
      10
    ),
    search: url.searchParams.get('search') || '',
  };
}

async function plansModel(
  options: Parameters<typeof getMeetTogetherPlansData>[0]
) {
  // Only the plan lists need the legacy Meet Together data layer.
  const { getMeetTogetherPlansData } =
    await import('@tuturuuu/ui/legacy/meet/page');
  const result = await getMeetTogetherPlansData(options);
  const user = result.user;
  return {
    ...result,
    user: user
      ? {
          id: user.id,
          created_at: user.created_at,
          user_metadata: {
            avatar_url: user.user_metadata?.avatar_url,
            bio: user.user_metadata?.bio,
            display_name: user.user_metadata?.display_name,
            handle: user.user_metadata?.handle,
          },
        }
      : null,
  };
}

export async function loadPageModel(path: string) {
  const current = meetRequest();
  const url = new URL(path, current.request.url);
  if (url.origin !== new URL(current.request.url).origin)
    throw new Error('Invalid Meet page origin');
  const base = current.basePath;
  if (base && (url.pathname === base || url.pathname.startsWith(`${base}/`)))
    url.pathname = url.pathname.slice(base.length) || '/';
  return withMeetRequest(
    {
      ...current,
      request: new Request(url, { headers: current.request.headers }),
    },
    () => loadResolvedPageModel(url)
  );
}

async function loadResolvedPageModel(url: URL) {
  const segments = url.pathname.split('/').filter(Boolean);
  const locale =
    segments[0] === 'vi'
      ? 'vi'
      : segments[0] === 'en'
        ? 'en'
        : await getLocale();
  if (segments[0] === 'en' || segments[0] === 'vi') segments.shift();
  const actorStartedAt = performance.now();
  const actor = await getSatelliteAppSessionUser('meet');
  if (actor) {
    markSignedInDocument();
    recordMeetPhase('actor', performance.now() - actorStartedAt);
  }
  const badgeIdentity =
    actor && isExactTuturuuuDotComEmail(actor.email)
      ? await getVerifiedAuthUser(
          await createAdminClient({ noCookie: true }),
          actor.id
        )
      : null;
  const params: Record<string, string> = { locale };
  if (segments[0] === 'r' && segments[1]) params.code = segments[1];
  else if (segments[0] === 'plans' && segments[1]) params.planId = segments[1];
  else if (segments[0] && ['meetings', 'plans'].includes(segments[1] ?? '')) {
    params.wsId = segments[0];
    if (segments[2]) params.meetingId = segments[2];
  }
  const common = {
    params,
    locale,
    actorId: actor?.id,
    showVersionBadge: isVerifiedTuturuuuStaffSession(badgeIdentity),
    meta: buildMeetSeo(
      segments.length
        ? { kind: 'page', path: `/${segments.join('/')}` }
        : { kind: 'landing' },
      locale
    ) satisfies MeetPageMeta,
  };
  if (segments[0] === 'login' && segments.length === 1) {
    const { default: LoginPage } =
      await import('../app/[locale]/(auth)/login/page');
    await LoginPage({
      searchParams: Promise.resolve(Object.fromEntries(url.searchParams)),
    });
    throw new Error('Meet login did not redirect');
  }
  if (segments[0] === 'verify-token' && segments.length === 1)
    return { ...common, kind: 'verify-token' as const };
  if (segments[0] === 'native-collaboration' && segments.length === 1)
    return { ...common, kind: 'native-collaboration' as const };
  if (segments[0] === 'r' && segments[1] && segments.length === 2)
    return { ...common, ...(await roomModel(segments[1], locale, url)) };
  if (segments[0] === 'plans' && segments[1] && segments.length === 2) {
    const profilePromise = actor
      ? getSatelliteCurrentUser('meet').catch(() => null)
      : Promise.resolve(null);
    const snapshot = await getMeetPlanSnapshot(
      segments[1],
      withForwardedInternalApiAuth(await headers())
    ).catch(async (error: unknown) => {
      await profilePromise;
      if (
        error instanceof InternalApiError &&
        [401, 403, 404].includes(error.status)
      )
        throw notFound();
      throw error;
    });
    const profile = await profilePromise;
    return {
      ...common,
      kind: 'plan' as const,
      snapshot: { ...snapshot, polls: meetPlanPolls.parse(snapshot.polls) },
      profile,
      meta: buildMeetSeo(
        {
          kind: 'page',
          path: `/${segments.join('/')}`,
          title: snapshot.plan.name || (locale === 'vi' ? 'Kế hoạch' : 'Plan'),
        },
        locale
      ),
    };
  }
  if (segments.length === 0) {
    if (actor)
      throw redirect({
        href: `${locale === 'vi' ? '/vi' : ''}/personal/meetings`,
      });
    const paging = pagination(url, 9);
    return {
      ...common,
      kind: 'public-plans' as const,
      paging,
      plans: { data: [], totalCount: 0, user: null },
    };
  }
  const workspaceId = segments[0];
  if (!workspaceId || segments.length > 3) throw notFound();
  if (segments.length === 1)
    throw redirect({
      href: `${locale === 'vi' ? '/vi' : ''}/${workspaceId}/meetings`,
    });
  if (segments[1] !== 'meetings' && segments[1] !== 'plans') throw notFound();
  // Hosting eligibility only depends on the actor, so it resolves alongside
  // the workspace instead of after it.
  const hostingPromise =
    segments[1] === 'meetings' && segments.length === 2 && actor
      ? timeMeetPhase('hosting', hostingModel(actor.id))
      : Promise.resolve({ canCreate: false, unavailable: false });
  hostingPromise.catch(() => undefined);
  const workspace = await workspaceModel(workspaceId).catch(
    async (error: unknown) => {
      await hostingPromise.catch(() => undefined);
      throw error;
    }
  );
  if (workspace.kind === 'invitation')
    return { ...common, kind: 'workspace-invitation' as const, workspace };
  if (segments[1] === 'plans' && segments.length === 2) {
    const paging = pagination(url, 9);
    return {
      ...common,
      kind: 'workspace-plans' as const,
      workspace,
      paging,
      plans: await plansModel({
        ...paging,
        wsId: workspace.wsId,
        scope: workspace.workspace.personal
          ? 'personal-consolidated'
          : 'workspace',
      }),
    };
  }
  if (segments[1] === 'meetings' && segments[2])
    return {
      ...common,
      kind: 'meeting' as const,
      workspace,
      detail: await detailModel(workspace, segments[2]),
    };
  if (segments[1] === 'meetings') {
    const paging = pagination(url, 10);
    return {
      ...common,
      kind: 'meetings' as const,
      workspace,
      paging,
      hosting: await hostingPromise,
    };
  }
  throw notFound();
}

export type MeetPageModel = Awaited<ReturnType<typeof loadPageModel>>;
