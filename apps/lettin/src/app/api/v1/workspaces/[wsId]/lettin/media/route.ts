import { z } from 'zod';
import { bindings } from '@/server/bindings';
import { LettinError } from '@/server/context';
import { boundedBody, handle, respond } from '@/server/http';
import { resolveActor } from '@/server/identity';
import { uploadMedia } from '@/server/media';
export function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  return handle(async () => {
    const actor = await resolveActor((await params).wsId);
    const bytes = await boundedBody(request, 11 * 1024 * 1024);
    let form: FormData;
    try {
      form = await new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: bytes,
      }).formData();
    } catch {
      throw new LettinError(400, 'Invalid upload');
    }
    const world = form.get('worldId'),
      file = form.get('file');
    if (
      typeof world !== 'string' ||
      !z.guid().safeParse(world).success ||
      !(file instanceof File)
    )
      throw new LettinError(400, 'Invalid artwork');
    const { db, media } = await bindings();
    return respond(await uploadMedia(db, media, actor, world, file));
  });
}
