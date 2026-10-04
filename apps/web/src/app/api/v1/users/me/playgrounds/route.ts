import {
  createPlayground,
  listPlaygrounds,
} from '@tuturuuu/storage-core/playground-service';
import { connection } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  playgroundAuth,
  playgroundBody,
  playgroundResponse,
} from './route-utils';
export const GET = withSessionAuth(async (_req, { user }) => {
  await connection();
  return playgroundResponse(() => listPlaygrounds(user.id));
}, playgroundAuth);
export const POST = withSessionAuth(
  async (req, { user }) =>
    playgroundResponse(async () =>
      createPlayground(user.id, await playgroundBody(req))
    ),
  playgroundAuth
);
