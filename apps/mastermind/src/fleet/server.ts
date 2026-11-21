import { createServerFn } from '@tanstack/react-start';
import { createFleetClient } from '../native/clients';
import { currentOwner } from '../native/context';
import { z } from 'zod';
import { fetchReviewPreview } from '../native/review-preview';
import { fleetAnswerRequestSchema } from './contract';

/**
 * The only data paths of the command center. Both run after the Worker's
 * session, MFA, allowlist and live-permission gates, read the owner from
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

/**
 * A design review's preview image as a data URL, or null. Only the decision
 * id comes from the page; the image source is read from the owner's own
 * validated snapshot.
 */
export const loadReviewPreview = createServerFn({ method: 'GET' })
  .validator(
    z.object({ decisionId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/) })
  )
  .handler(async ({ data }) => {
    const owner = currentOwner();
    const read = await createFleetClient(owner).state();
    if (read.kind !== 'ready') return null;
    const decision = read.snapshot.state.decisions.find(
      (d) => d.id === data.decisionId && d.kind === 'review'
    );
    return decision?.review ? fetchReviewPreview(owner, decision.review) : null;
  });
