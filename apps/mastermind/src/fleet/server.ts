import { createServerFn } from '@tanstack/react-start';
import { createFleetClient } from '../native/clients';
import { currentOwner } from '../native/context';
import { fleetAnswerRequestSchema } from './contract';

/**
 * The only data paths of the command center. Both run after the Worker's
 * Access, session, allowlist and live-permission gates, read the owner from
 * the request context and talk to Web with the owner's own bearer.
 */
export const loadFleet = createServerFn({ method: 'GET' }).handler(async () => {
  const owner = currentOwner();
  return {
    email: owner.email,
    fetchedAt: new Date().toISOString(),
    read: await createFleetClient(owner).state(),
  };
});

export const answerFleetDecision = createServerFn({ method: 'POST' })
  .validator(fleetAnswerRequestSchema)
  .handler(({ data }) => createFleetClient(currentOwner()).answer(data));
