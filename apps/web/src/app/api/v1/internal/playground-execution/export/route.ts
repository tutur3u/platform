import {
  authorizeCloudPlaygroundTicket,
  cloudPlaygroundWriteback,
} from '@tuturuuu/storage-core/cloud-playground';
import { syncCloudPlaygroundFiles } from '@tuturuuu/storage-core/playground-runner-sync';
import { AccountServiceError } from '@tuturuuu/utils/account-benefits-server';
import { PlaygroundRunnerExport } from '@tuturuuu/utils/playground-schema';

const headers = { 'Cache-Control': 'private, no-store' };
const maxBody = 3 * 1024 * 1024;

export async function POST(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 2055) {
    return new Response(null, { status: 401, headers });
  }
  try {
    const claims = await authorizeCloudPlaygroundTicket(
      authorization.slice(7),
      'tuturuuu.meet.playground-export'
    );
    await cloudPlaygroundWriteback(
      'verify',
      {
        meetingId: claims.meetingId,
        ownerId: claims.ownerId,
        projectId: claims.projectId,
      },
      claims.runId,
      claims.revision
    );
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400, headers });
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let raw = '';
    let bytes = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maxBody) {
          void reader.cancel().catch(() => {});
          return new Response(null, { status: 413, headers });
        }
        raw += decoder.decode(chunk.value, { stream: true });
      }
    } finally {
      reader.releaseLock();
    }
    const data = PlaygroundRunnerExport.safeParse(
      JSON.parse(raw + decoder.decode())
    );
    if (!data.success || data.data.revision !== claims.revision) {
      return new Response(null, { status: 409, headers });
    }
    const result = await syncCloudPlaygroundFiles({
      ...data.data,
      actorId: claims.ownerId,
      projectId: claims.projectId,
      meetingId: claims.roomMeetingId,
      runId: claims.runId,
      executionMeetingId: claims.meetingId,
    });
    return Response.json(result, { headers });
  } catch (error) {
    const status =
      error instanceof AccountServiceError
        ? error.status
        : error instanceof SyntaxError
          ? 400
          : 503;
    return new Response(null, { status, headers });
  }
}
