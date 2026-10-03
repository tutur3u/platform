import { getPlaygroundRun } from '@tuturuuu/storage-core/playground-service';
import { connection } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  playgroundAuth,
  playgroundId,
  playgroundResponse,
} from '../../../route-utils';
export const GET = withSessionAuth<{ projectId: string; runId: string }>(
  async (_req, { user }, { projectId, runId }) => {
    await connection();
    return playgroundResponse(async () => {
      const { preview: _preview, ...result } = await getPlaygroundRun(
        user.id,
        playgroundId(projectId),
        playgroundId(runId)
      );
      return result;
    });
  },
  playgroundAuth
);
