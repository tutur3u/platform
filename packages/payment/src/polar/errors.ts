import { AlreadyCanceledSubscription } from '@polar-sh/sdk/models/errors/alreadycanceledsubscription';
import { PolarError } from '@polar-sh/sdk/models/errors/polarerror';

export { AlreadyCanceledSubscription, PolarError };

export function isPolarNotFound(error: unknown): boolean {
  return error instanceof PolarError && error.statusCode === 404;
}

export function isPolarSubscriptionEnded(error: unknown): boolean {
  return isPolarNotFound(error) || error instanceof AlreadyCanceledSubscription;
}
