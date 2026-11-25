import { executePlayground } from '@tuturuuu/storage-core/playground-service';
import { PLAYGROUND_STDIN_MAX_LENGTH } from '@tuturuuu/types/primitives/playgrounds';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  playgroundAuth,
  playgroundBody,
  playgroundId,
  playgroundResponse,
} from '../../route-utils';

const schema = z
  .object({
    operation: z.enum(['run', 'stop']),
    requestId: z.guid(),
    stdin: z.string().max(PLAYGROUND_STDIN_MAX_LENGTH).optional(),
  })
  .strict();
export const POST = withSessionAuth<{ projectId: string }>(
  async (req, { user }, { projectId }) =>
    playgroundResponse(async () => {
      const { operation, requestId, stdin } = schema.parse(
        await playgroundBody(req)
      );
      return executePlayground(
        user.id,
        playgroundId(projectId),
        operation,
        requestId,
        { stdin }
      );
    }),
  playgroundAuth
);
