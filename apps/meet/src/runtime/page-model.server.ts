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
import { getHostMeetingDurationSeconds } from '@tuturuuu/meet-core/features/call/lib/meeting-duration';
import { getMeetingPublicInfo } from '@tuturuuu/meet-core/features/call/lib/meeting-public-info';
import {
  decodeRoomCode,
  encodeRoomCode,
} from '@tuturuuu/meet-core/features/call/lib/room-code';
import { readMeetingRoomPolicy } from '@tuturuuu/meet-core/features/meeting-ai/server/room-access';
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
import { getMeetTogetherPlansData } from '@tuturuuu/ui/legacy/meet/page';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { canVerifiedAccountHostMeeting } from '@tuturuuu/utils/meet-hosting';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import LoginPage from '../app/[locale]/(auth)/login/page';
import { loadMeetingCalendarEvent } from '../app/[locale]/[wsId]/meetings/[meetingId]/meeting-calendar-event';
import { getMeetWorkspaceContext } from '../app/[locale]/[wsId]/workspace-context';
import { getLocale, getTranslations } from './intl-server';
import type { MeetPageMeta } from './page-head';
import { meetPlanPolls } from './plan-polls';
import {
  cookies,
  headers,
  meetRequest,
  withMeetRequest,
} from './request-context';

async function roomModel(code: string, locale: string, url: URL) {
  const meetingId = decodeRoomCode(code);
  if (!meetingId) throw notFound();
  const t = await getTranslations('meet.call');
  const publicCopy = await getTranslations('meet.public');
  const info = await getMeetingPublicInfo(code);
  const canonical = `https://meet.tuturuuu.com${locale === 'vi' ? '/vi' : ''}/r/${encodeRoomCode(meetingId)}`;
  const meta: MeetPageMeta = {
    title: info?.title || publicCopy('meta_title'),
    description: info
      ? publicCopy(info.ended ? 'meta_ended' : 'meta_join')
      : publicCopy('meta_private'),
    indexable: Boolean(info),
    canonical,
    image: `${canonical}/preview?lang=${locale}`,
  };
  const access = await getMeetCallAccess(meetingId, t('guest')).catch(
    async (error: unknown) => {
      if (error instanceof MeetCallAccessError) {
        if (error.status === 401) {
          const returnTo = `${locale === 'en' ? '' : `/${locale}`}/r/${code}`;
          if (info) return { publicInvite: info, returnTo };
          throw redirect({
            href: `/login?next=${encodeURIComponent(returnTo)}`,
          });
        }
        if (error.status === 403 || error.status === 404) throw notFound();
      }
      throw error;
    }
  );
  if ('publicInvite' in access)
    return { kind: 'public-invite' as const, ...access, meta };
  const policy = await readMeetingRoomPolicy({
    meetingId,
    wsId: access.meeting.ws_id,
    userId: access.user.id,
    isHost: access.isHost,
  });
  return {
    kind: 'room' as const,
    meta,
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
    initialShowNotes: url.searchParams.get('notes') === '1',
  };
}

async function workspaceModel(id: string) {
  const invitation = await getPendingWorkspaceInvitation(id, await headers());
  if (invitation) return { kind: 'invitation' as const, invitation };
  // The workspace lookup and the member's profile read are independent
  // network calls; running them sequentially added both latencies to TTFB.
  const userPromise = getSatelliteCurrentUser('meet').catch(() => null);
  const context = await getMeetWorkspaceContext(id).catch(
    async (error: unknown) => {
      await userPromise;
      throw error;
    }
  );
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
  const permissionsPromise = getPermissions({ user, wsId }).then(
    (permissions) => ({ permissions }),
    (error: unknown) => ({ error })
  );
  const policy = await readMeetingRoomPolicy({
    meetingId,
    wsId,
    userId: user.id,
    isHost,
  });
  if (policy.ended) return { kind: 'ended' as const, meeting, isHost, policy };
  const outcome = await permissionsPromise;
  if ('error' in outcome) throw outcome.error;
  const calendarEvent = await loadMeetingCalendarEvent({
    supabase,
    permissions: outcome.permissions,
    wsId,
    meetingId,
  });
  const durationSeconds = await getHostMeetingDurationSeconds(
    meeting.creator_id
  );
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
  const actor = await getSatelliteAppSessionUser('meet');
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
    showVersionBadge: isExactTuturuuuDotComEmail(actor?.email),
    meta: {
      title: 'Tuturuuu Meet',
      description:
        locale === 'vi'
          ? 'Họp với âm thanh rõ ràng, chép lời trực tiếp và ghi chú kết nối với Tuturuuu Tasks và Calendar.'
          : 'Meet with clear audio, live transcription, and meeting notes connected to Tuturuuu Tasks and Calendar.',
      indexable: false,
      canonical: `https://meet.tuturuuu.com${locale === 'vi' ? '/vi' : ''}${segments.length ? `/${segments.join('/')}` : ''}`,
    } satisfies MeetPageMeta,
  };
  if (segments[0] === 'login' && segments.length === 1) {
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
      meta: {
        ...common.meta,
        title: `${snapshot.plan.name || (locale === 'vi' ? 'Kế hoạch' : 'Plan')} - Tuturuuu Meet`,
      },
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
      meta: { ...common.meta, indexable: true },
      paging,
      plans: await plansModel(paging),
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
      ? hostingModel(actor.id)
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
  if (segments[1] === 'meetings')
    return {
      ...common,
      kind: 'meetings' as const,
      workspace,
      paging: pagination(url, 10),
      hosting: await hostingPromise,
    };
  throw notFound();
}

export type MeetPageModel = Awaited<ReturnType<typeof loadPageModel>>;
