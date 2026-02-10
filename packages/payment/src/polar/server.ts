import { Polar } from '@tuturuuu/payment/polar';

/**
 * Creates a Polar client for server-side usage with Organization Access Token (OAT).
 *
 * This client authenticates with an OAT and should ONLY be used server-side for:
 * - Managing products, prices, checkouts, orders, and subscriptions
 * - Admin dashboards, internal tools, and automation
 * - Provisioning and privileged organization-level operations
 *
 * Environment Variables:
 * - `POLAR_ACCESS_TOKEN`: Your Organization Access Token (required)
 * - `POLAR_SANDBOX`: Set to 'true' to use sandbox environment for testing
 *
 * SECURITY: Never expose this client or its access token in client-side code.
 *
 * @returns Polar client configured for production or sandbox environment
 * @see https://polar.sh/docs/api/overview for authentication details
 */
export const createPolarClient = () => {
  const sandbox = process.env.POLAR_SANDBOX === 'true';

  return new Polar({
    accessToken: process.env.POLAR_ACCESS_TOKEN || '',
    server: sandbox ? 'sandbox' : 'production',
  });
};
