import { Polar } from '@tuturuuu/payment/polar';

/**
 * Creates a Polar client for client-side/browser usage.
 *
 * WARNING: This client has NO access token and should ONLY be used for:
 * - Public endpoints that don't require authentication
 * - Client-side code where exposing an OAT would be a security risk
 *
 * For server-side operations (managing products, orders, subscriptions),
 * use the server-side client with Organization Access Token (OAT) instead.
 *
 * @see {@link createPolarClient} from './server' for server-side usage with OAT
 */
export const createPolarClient = () => {
  return new Polar({});
};
