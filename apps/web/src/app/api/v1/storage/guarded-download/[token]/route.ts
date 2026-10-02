import { relayStorageDownload } from '@tuturuuu/storage-core/storage-download-relay';
import { connection } from 'next/server';

async function download(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  await connection();
  return relayStorageDownload(request, (await params).token);
}

export const GET = download;
export const HEAD = download;

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
      'Cache-Control': 'no-store',
    },
  });
}
