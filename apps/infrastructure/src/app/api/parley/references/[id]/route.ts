import { requireParleyAdministrator } from '@tuturuuu/meet-core/parley/authorization';
import { parleyDatabase } from '@tuturuuu/meet-core/parley/database';
import { connection } from 'next/server';
import { z } from 'zod';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    await requireParleyAdministrator();
  } catch {
    return new Response('Forbidden', { status: 403 });
  }
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return new Response('Not found', { status: 404 });
  const { data, error } = await (await parleyDatabase())
    .schema('private')
    .from('parley_references')
    .select('filename, media_type, content_base64')
    .eq('id', id.data)
    .maybeSingle();
  if (error) return new Response('Reference unavailable', { status: 503 });
  if (!data) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(data.content_base64, 'base64'), {
    headers: {
      'Content-Type': data.media_type,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(data.filename)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
