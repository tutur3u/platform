import { connection } from 'next/server';
import { z } from 'zod';
import { bindings } from '@/server/bindings';
import { LettinError } from '@/server/context';
import { handle } from '@/server/http';
import { resolveActor } from '@/server/identity';
import { getMedia } from '@/server/media';
export function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  return handle(async () => {
    await connection();
    const { mediaId } = await params;
    if (!z.guid().safeParse(mediaId).success) throw new LettinError(404);
    const { db, media } = await bindings();
    return getMedia(db, media, mediaId, resolveActor);
  });
}
