import type {
  LettinOverview,
  LettinPublicWorld,
  LettinWorld,
} from '@tuturuuu/internal-api/lettin';
import {
  type Actor,
  isCreator,
  record,
  type Store,
  type StoredRecord,
  worldRole,
} from './context';

export async function readWorld(
  db: Store,
  actor: Actor,
  worldId: string
): Promise<LettinWorld> {
  const role = await worldRole(db, actor, worldId);
  const world = await db
    .prepare('SELECT * FROM worlds WHERE id = ? AND ws_id = ?')
    .bind(worldId, actor.wsId)
    .first<StoredRecord>();
  if (!world) throw new Error('World disappeared');
  const entries = await db
    .prepare(
      'SELECT * FROM entries WHERE world_id = ? AND ws_id = ? ORDER BY updated_at DESC'
    )
    .bind(worldId, actor.wsId)
    .all<StoredRecord>();
  const names = role === 'owner' ? await actor.memberNames() : [];
  const collaborators =
    role === 'owner'
      ? (
          await db
            .prepare(
              'SELECT user_id, role FROM collaborators WHERE world_id = ? AND ws_id = ?'
            )
            .bind(worldId, actor.wsId)
            .all<{ user_id: string; role: 'editor' | 'publisher' }>()
        ).results
      : [];
  const eligibleMembers: LettinWorld['eligibleMembers'] = [];
  if (role === 'owner') {
    const creators = new Set(
      (
        await db
          .prepare('SELECT user_id FROM creators WHERE enabled = 1')
          .all<{ user_id: string }>()
      ).results.map((c) => c.user_id)
    );
    const candidates = names.filter(
      (member) =>
        member.user_id !== world.owner_id && creators.has(member.user_id)
    );
    for (let offset = 0; offset < candidates.length; offset += 5) {
      const batch = candidates.slice(offset, offset + 5);
      const eligible = await Promise.all(
        batch.map((member) => actor.eligibleMember(member.user_id))
      );
      eligibleMembers.push(...batch.filter((_, index) => eligible[index]));
    }
  }
  return {
    world: record(world),
    entries: entries.results.map(record),
    role,
    collaborators: collaborators.map((c) => ({
      ...c,
      name: names.find((n) => n.user_id === c.user_id)?.name ?? null,
    })),
    eligibleMembers,
  };
}
export async function readOverview(
  db: Store,
  actor: Actor
): Promise<LettinOverview> {
  const approved = await isCreator(db, actor);
  const canInvite =
    actor.isAdmin ||
    Boolean(
      await db
        .prepare(
          'SELECT 1 FROM creators WHERE user_id = ? AND enabled = 1 AND can_invite = 1'
        )
        .bind(actor.id)
        .first()
    );
  const worlds: LettinOverview['worlds'] = [];
  if (approved && actor.canManage) {
    const rows = await db
      .prepare(`SELECT w.*, CASE WHEN w.owner_id = ? THEN 'owner' ELSE c.role END AS role
      FROM worlds w LEFT JOIN collaborators c ON c.world_id=w.id AND c.user_id=?
      WHERE w.ws_id=? AND (w.owner_id=? OR c.user_id IS NOT NULL) ORDER BY w.updated_at DESC`)
      .bind(actor.id, actor.id, actor.wsId, actor.id)
      .all<StoredRecord & { role: LettinWorld['role'] }>();
    worlds.push(...rows.results.map((w) => ({ ...record(w), role: w.role })));
  }
  const invitations = (
    await db
      .prepare(
        `SELECT id,email,expires_at FROM invitations WHERE (?=1 OR invited_by=?) AND accepted_by IS NULL AND revoked=0 AND expires_at > ? ORDER BY created_at DESC`
      )
      .bind(Number(actor.isAdmin), actor.id, new Date().toISOString())
      .all<LettinOverview['invitations'][number]>()
  ).results;
  const creators = actor.isAdmin
    ? (
        await db
          .prepare(
            'SELECT user_id,can_invite,enabled FROM creators ORDER BY created_at DESC'
          )
          .all<{ user_id: string; can_invite: number; enabled: number }>()
      ).results.map((c) => ({
        ...c,
        name: null,
        can_invite: Boolean(c.can_invite),
        enabled: Boolean(c.enabled),
      }))
    : [];
  return {
    approved,
    canCreate: approved && actor.canManage,
    isAdmin: actor.isAdmin,
    canInvite,
    worlds,
    invitations,
    creators,
  };
}
export const PUBLIC_PAGE_SIZE = 24;
export type PublicFilters = {
  creatorId?: string;
  page?: number;
  search?: string;
};
export async function readPublic(
  db: Store,
  worldId?: string,
  filters: PublicFilters = {}
): Promise<LettinPublicWorld[]> {
  const conditions = ['published IS NOT NULL'];
  const values: (string | number)[] = [];
  if (worldId) {
    conditions.push('id=?');
    values.push(worldId);
  }
  if (filters.creatorId) {
    conditions.push('owner_id=?');
    values.push(filters.creatorId);
  }
  if (filters.search) {
    conditions.push(
      "(json_extract(published,'$.title') LIKE ? OR json_extract(published,'$.description') LIKE ? OR json_extract(published,'$.credit') LIKE ?)"
    );
    values.push(...Array<string>(3).fill(`%${filters.search}%`));
  }
  // Catalogue pages contain only card fields; documents are loaded for one world.
  const projection = worldId
    ? 'published'
    : "json_remove(published,'$.content','$.links','$.tags') AS published";
  const rows = await db
    .prepare(
      `SELECT id,owner_id,${projection} FROM worlds WHERE ${conditions.join(' AND ')} ORDER BY published_at DESC,id LIMIT ? OFFSET ?`
    )
    .bind(
      ...values,
      worldId ? 1 : PUBLIC_PAGE_SIZE + 1,
      worldId ? 0 : Math.max(0, (filters.page ?? 1) - 1) * PUBLIC_PAGE_SIZE
    )
    .all<{ id: string; owner_id: string; published: string }>();
  const entries = worldId
    ? (
        await db
          .prepare(
            "SELECT id,published FROM entries WHERE world_id=? AND published IS NOT NULL ORDER BY json_extract(published,'$.title')"
          )
          .bind(worldId)
          .all<{ id: string; published: string }>()
      ).results.map((entry) => ({
        id: entry.id,
        published: JSON.parse(
          entry.published
        ) as LettinPublicWorld['published'],
      }))
    : [];
  const publicIds = new Set(entries.map((entry) => entry.id));
  return rows.results.map((row) => ({
    id: row.id,
    creatorId: row.owner_id,
    published: {
      content: { type: 'doc', content: [] },
      tags: [],
      ...JSON.parse(row.published),
      links: [],
    },
    entries: entries.map((entry) => ({
      ...entry,
      published: {
        ...entry.published,
        links: entry.published.links.filter((id) => publicIds.has(id)),
      },
    })),
  }));
}
