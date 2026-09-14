import type {
  LettinDraft,
  LettinRecord,
  LettinRole,
} from '@tuturuuu/internal-api/lettin';

export class LettinError extends Error {
  constructor(
    public status: number,
    message = 'Request failed'
  ) {
    super(message);
  }
}
export type Actor = {
  id: string;
  wsId: string;
  isAdmin: boolean;
  canManage: boolean;
  verifiedEmail: () => Promise<string | null>;
  eligibleMember: (userId: string) => Promise<boolean>;
  memberNames: () => Promise<{ user_id: string; name: string | null }[]>;
};
export type Store = Pick<D1Database, 'prepare' | 'batch'>;
export type StoredRecord = Omit<LettinRecord, 'draft' | 'published'> & {
  ws_id: string;
  owner_id?: string;
  world_id?: string;
  draft: string;
  published: string | null;
};
export function record(row: StoredRecord): LettinRecord {
  return {
    id: row.id,
    version: row.version,
    published_at: row.published_at,
    draft: JSON.parse(row.draft) as LettinDraft,
    published: row.published
      ? (JSON.parse(row.published) as LettinDraft)
      : null,
  };
}
export async function isCreator(
  db: Store,
  actor: Pick<Actor, 'id' | 'isAdmin'>
) {
  return (
    actor.isAdmin ||
    Boolean(
      await db
        .prepare('SELECT 1 FROM creators WHERE user_id = ? AND enabled = 1')
        .bind(actor.id)
        .first()
    )
  );
}
export async function worldRole(
  db: Store,
  actor: Actor,
  worldId: string
): Promise<LettinRole> {
  if (!actor.canManage || !(await isCreator(db, actor)))
    throw new LettinError(403);
  const row = await db
    .prepare(`SELECT CASE WHEN w.owner_id = ? THEN 'owner' ELSE c.role END AS role
    FROM worlds w LEFT JOIN collaborators c ON c.world_id = w.id AND c.user_id = ?
    WHERE w.id = ? AND w.ws_id = ?`)
    .bind(actor.id, actor.id, worldId, actor.wsId)
    .first<{ role: LettinRole | null }>();
  if (!row?.role) throw new LettinError(403);
  return row.role;
}
// Included in write statements so a concurrent creator/collaborator revocation
// cannot be bypassed between the initial authorization read and the write.
export function writeAccess(actor: Actor, worldId: string, publish = false) {
  const roles = publish ? "('publisher')" : "('editor', 'publisher')";
  return {
    sql: `EXISTS (SELECT 1 FROM worlds w WHERE w.id = ? AND w.ws_id = ?
      AND (? = 1 OR EXISTS (SELECT 1 FROM creators WHERE user_id = ? AND enabled = 1))
      AND (w.owner_id = ? OR EXISTS (SELECT 1 FROM collaborators c
        WHERE c.world_id = w.id AND c.user_id = ? AND c.role IN ${roles})))`,
    values: [
      worldId,
      actor.wsId,
      Number(actor.isAdmin),
      actor.id,
      actor.id,
      actor.id,
    ],
  };
}
