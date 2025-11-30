import { Polar } from '@tuturuuu/payment/polar';

export const createPolarClient = () => {
  const sandbox = process.env.POLAR_SANDBOX === 'true';

  return new Polar({
    accessToken: process.env.POLAR_ACCESS_TOKEN || '',
    server: sandbox ? 'sandbox' : 'production',
  });
};
