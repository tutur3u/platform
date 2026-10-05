import { listHostedPlaygrounds } from '@tuturuuu/internal-api/playgrounds';
/** Do not expose a response from an account that changed during discovery. */
export async function readMeetingProjects(
  accountId: string,
  read = listHostedPlaygrounds
) {
  const result = await read();
  if (result.actorId !== accountId)
    throw new Error('programming_actor_changed');
  return result;
}
