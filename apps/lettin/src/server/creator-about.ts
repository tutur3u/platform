import { z } from 'zod';
import { type Actor, isCreator, LettinError, type Store } from './context';
import { richTextNodeSchema, safeLink } from './rich-text-schema';

export const creatorAboutSchema = z.object({
  shared: z.boolean().default(false),
  headline: z.string().trim().max(160),
  pronouns: z.string().trim().max(80),
  location: z.string().trim().max(160),
  interests: z.array(z.string().trim().min(1).max(60)).max(20),
  links: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        url: z
          .string()
          .max(2000)
          .refine((value) => value.startsWith('https://') && safeLink(value)),
      })
    )
    .max(10),
  content: richTextNodeSchema.refine((node) => node.type === 'doc'),
  theme: z.object({
    palette: z.enum(['paper', 'forest', 'midnight', 'rose']),
    typography: z.enum(['editorial', 'clean']),
    motion: z.enum(['full', 'reduced']),
  }),
});
export type CreatorAbout = z.infer<typeof creatorAboutSchema>;
export const emptyCreatorAbout: CreatorAbout = {
  shared: false,
  headline: '',
  pronouns: '',
  location: '',
  interests: [],
  links: [],
  content: { type: 'doc', content: [{ type: 'paragraph' }] },
  theme: { palette: 'paper', typography: 'editorial', motion: 'full' },
};
export async function readCreatorAbout(
  db: Store,
  userId: string
): Promise<CreatorAbout> {
  const row = await db
    .prepare('SELECT details FROM creator_profiles WHERE user_id=?')
    .bind(userId)
    .first<{ details: string }>();
  return row
    ? creatorAboutSchema.parse(JSON.parse(row.details))
    : emptyCreatorAbout;
}
export async function saveCreatorAbout(
  db: Store,
  actor: Actor,
  details: CreatorAbout
) {
  if (!actor.canManage || !(await isCreator(db, actor)))
    throw new LettinError(403);
  const row = await db
    .prepare(
      `INSERT INTO creator_profiles(user_id,details) SELECT ?,? WHERE (?=1 OR EXISTS(SELECT 1 FROM creators WHERE user_id=? AND enabled=1)) ON CONFLICT(user_id) DO UPDATE SET details=excluded.details,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') RETURNING user_id`
    )
    .bind(actor.id, JSON.stringify(details), Number(actor.isAdmin), actor.id)
    .first();
  if (!row) throw new LettinError(403);
  return details;
}

/** Existing About text is private until its owner explicitly opts in. */
export async function readPublicCreatorAbout(db: Store, userId: string) {
  const details = await readCreatorAbout(db, userId);
  return details.shared === true ? details : null;
}
