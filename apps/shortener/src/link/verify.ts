import { z } from 'zod';
import type { LinkClickRecord, ShortLinkStore } from './store';

const verifySchema = z.object({
  linkId: z.string(),
  password: z.string(),
  slug: z.string().optional(),
});

export interface VerifyDependencies {
  store: ShortLinkStore;
  comparePassword(password: string, hash: string): Promise<boolean>;
  click(linkId: string): LinkClickRecord;
  track(store: ShortLinkStore, record: LinkClickRecord): Promise<void>;
}

/** POST /api/verify with the legacy status codes and response bodies. */
export async function verifyShortLinkPassword(
  request: Request,
  deps: VerifyDependencies
): Promise<Response> {
  try {
    const result = verifySchema.safeParse(await request.json());
    if (!result.success) {
      return Response.json(
        { error: 'Invalid request data', details: result.error.format() },
        { status: 400 }
      );
    }
    const { linkId, password } = result.data;
    const link = await deps.store.findById(linkId);
    if (!link) {
      return Response.json({ error: 'Link not found' }, { status: 404 });
    }
    if (!link.password_hash) return Response.json({ url: link.link });
    if (!(await deps.comparePassword(password, link.password_hash))) {
      return Response.json(
        { error: 'Incorrect password. Please try again.' },
        { status: 403 }
      );
    }
    await deps.track(deps.store, deps.click(link.id));
    return Response.json({ url: link.link, success: true });
  } catch (error) {
    console.error('Verify error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
