import {
  getPlayground,
  savePlayground,
} from '@tuturuuu/storage-core/playground-service';
import { connection } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  playgroundAuth,
  playgroundBody,
  playgroundId,
  playgroundResponse,
} from '../route-utils';
export const GET = withSessionAuth<{ projectId: string }>(
  async (_req, { user }, { projectId }) => {
    await connection();
    return playgroundResponse(() =>
      getPlayground(user.id, playgroundId(projectId))
    );
  },
  playgroundAuth
);
export const PUT = withSessionAuth<{ projectId: string }>(
  async (req, { user }, { projectId }) =>
    playgroundResponse(async () =>
      savePlayground(
        user.id,
        playgroundId(projectId),
        await playgroundBody(req)
      )
    ),
  playgroundAuth
);
