import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  MEET_SHORT_LINK_DOMAIN,
  type MeetShortLinkKind,
} from '@tuturuuu/utils/meet-short-link-policy';
import type { MeetShortLinkRepository, MeetShortLinkRow } from './service';

const COLUMNS = 'id, slug, meet_link_kind, creator_id, expires_at';

type Row = {
  id: string;
  slug: string;
  meet_link_kind: string | null;
  creator_id: string;
  expires_at: string | null;
};

function toRow(row: Row): MeetShortLinkRow {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.meet_link_kind === 'vanity' ? 'vanity' : 'generated',
    creatorId: row.creator_id,
    expiresAt: row.expires_at ?? new Date(0).toISOString(),
  };
}

function unavailable(): never {
  throw new Error('Meeting short link storage unavailable');
}

/** Service-role adapter: callers authorize before every write. */
export function createSupabaseMeetShortLinkRepository(
  admin: TypedSupabaseClient
): MeetShortLinkRepository {
  const links = () => admin.from('shortened_links');
  return {
    async list(meetingId) {
      const { data, error } = await links()
        .select(COLUMNS)
        .eq('meet_meeting_id', meetingId)
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) unavailable();
      return (data ?? []).map(toRow);
    },
    async purgeExpired(meetingId, nowIso) {
      const { error } = await links()
        .delete()
        .eq('meet_meeting_id', meetingId)
        .lte('expires_at', nowIso);
      if (error) unavailable();
    },
    async clicks(linkIds) {
      const counts: Record<string, number> = {};
      await Promise.all(
        linkIds.map(async (id) => {
          const { count, error } = await admin
            .from('link_analytics')
            .select('id', { count: 'exact', head: true })
            .eq('link_id', id);
          counts[id] = error ? 0 : (count ?? 0);
        })
      );
      return counts;
    },
    async insert(row) {
      const { data, error } = await links()
        .insert({
          slug: row.slug,
          link: row.link,
          domain: MEET_SHORT_LINK_DOMAIN,
          creator_id: row.creatorId,
          ws_id: row.wsId,
          meet_meeting_id: row.meetingId,
          meet_link_kind: row.kind,
          expires_at: row.expiresAt,
        })
        .select(COLUMNS)
        .single();
      if (error?.code === '23505') return 'taken';
      // The guard trigger's per-meeting vanity cap (check_violation).
      if (error?.code === '23514' && row.kind === 'vanity') return 'limit';
      if (error || !data) unavailable();
      return toRow(data);
    },
    async update(id, meetingId, patch) {
      const { data, error } = await links()
        .update({
          ...(patch.slug ? { slug: patch.slug } : {}),
          ...(patch.expiresAt ? { expires_at: patch.expiresAt } : {}),
          ...(patch.creatorId ? { creator_id: patch.creatorId } : {}),
        })
        .eq('id', id)
        .eq('meet_meeting_id', meetingId)
        .select(COLUMNS)
        .maybeSingle();
      if (error?.code === '23505') return 'taken';
      if (error) unavailable();
      return data ? toRow(data) : null;
    },
    async remove(id, meetingId) {
      const { data, error } = await links()
        .delete()
        .eq('id', id)
        .eq('meet_meeting_id', meetingId)
        .select('id');
      if (error) unavailable();
      return (data ?? []).length > 0;
    },
    async recentActions(actorId, kind: MeetShortLinkKind, sinceIso) {
      const { count, error } = await admin
        .schema('private')
        .from('meet_short_link_audit')
        .select('id', { count: 'exact', head: true })
        .eq('actor_id', actorId)
        .eq('link_kind', kind)
        .gte('created_at', sinceIso);
      if (error) unavailable();
      return count ?? 0;
    },
    async audit(entry) {
      const { error } = await admin
        .schema('private')
        .from('meet_short_link_audit')
        .insert({
          ws_id: entry.wsId,
          meeting_id: entry.meetingId,
          actor_id: entry.actorId,
          action: entry.action,
          link_kind: entry.kind,
          slug: entry.slug,
          previous_slug: entry.previousSlug ?? null,
        });
      if (error) unavailable();
    },
  };
}
