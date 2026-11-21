import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { currentOwner } from '../native/context';
import { createShipClient } from '../native/ship-client';

/**
 * Ship data paths. Both run after the Worker's owner gates and call Web with
 * the owner's own bearer; Web and Cron Control enforce the check rate limit.
 */
export const loadShip = createServerFn({ method: 'GET' })
  // `fresh` skips Web's few-second read cache (the read after Check now).
  .validator(z.object({ fresh: z.boolean().optional() }).optional())
  .handler(({ data }) => createShipClient(currentOwner()).read(data?.fresh));

export const checkShipNow = createServerFn({ method: 'POST' }).handler(() =>
  createShipClient(currentOwner()).check()
);
