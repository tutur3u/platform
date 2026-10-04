import { playgroundCollaborationTicket } from '@tuturuuu/storage-core/programming-collaboration';
import { accountPrivateRpc } from '@tuturuuu/utils/account-benefits-server';
import { connection } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  playgroundAuth,
  playgroundBody,
  playgroundId,
  playgroundResponse,
} from '../../route-utils';
export const GET = withSessionAuth<{ projectId: string }>(
  async (_req, { user }, { projectId }) => {
    await connection();
    return playgroundResponse(() =>
      playgroundCollaborationTicket(
        user.id,
        playgroundId(projectId),
        user.user_metadata?.display_name ?? 'Participant'
      )
    );
  },
  playgroundAuth
);
export const POST = withSessionAuth<{ projectId: string }>(
  async (_req, { user }, { projectId }) =>
    playgroundResponse(() =>
      playgroundCollaborationTicket(
        user.id,
        playgroundId(projectId),
        user.user_metadata?.display_name ?? 'Participant',
        true
      )
    ),
  playgroundAuth
);
export const PUT = withSessionAuth<{ projectId: string }>(
  async (req, { user }, { projectId }) =>
    playgroundResponse(async () => {
      const body = z
        .object({
          userId: z.guid(),
          role: z.enum(['editor', 'viewer']).nullable(),
        })
        .strict()
        .parse(await playgroundBody(req));
      return accountPrivateRpc('set_playground_collaborator', {
        p_actor_id: user.id,
        p_id: playgroundId(projectId),
        p_user_id: body.userId,
        p_role: body.role,
      });
    }),
  playgroundAuth
);
