import { createServerFn } from '@tanstack/react-start';
import {
  fleetIntentInputSchema,
  fleetLinkConfirmationInputSchema,
} from '@tuturuuu/internal-api/fleet';
import { z } from 'zod';
import { currentFleetActor } from '../native/context';
import {
  checkFleetLink,
  fleetApiOptions,
  issueFleetLinkCode,
  readFleetAccess,
  readFleetDigest,
  readFleetIntents,
  sendFleetIntent,
} from './upstream';

const options = () => fleetApiOptions(currentFleetActor().token);

export const fleetAccessFn = createServerFn({ method: 'GET' }).handler(() =>
  readFleetAccess(options())
);

export const fleetDigestFn = createServerFn({ method: 'GET' }).handler(() =>
  readFleetDigest(options())
);

export const fleetIntentsFn = createServerFn({ method: 'GET' })
  .validator(z.strictObject({ before: z.uuid().optional() }))
  .handler(({ data }) => readFleetIntents(data.before, options()));

export const submitFleetIntentFn = createServerFn({ method: 'POST' })
  .validator(fleetIntentInputSchema)
  .handler(({ data }) => sendFleetIntent(data, options()));

export const issueFleetLinkCodeFn = createServerFn({ method: 'POST' }).handler(
  () => issueFleetLinkCode(options())
);

export const confirmFleetLinkFn = createServerFn({ method: 'POST' })
  .validator(fleetLinkConfirmationInputSchema)
  .handler(({ data }) => checkFleetLink(data, options()));
