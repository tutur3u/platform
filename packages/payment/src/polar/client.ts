import { Polar } from '@tuturuuu/payment/polar';

export const createPolarClient = ({ sandbox = false }: { sandbox?: boolean }) =>
  new Polar({
    accessToken: process.env.POLAR_ACCESS_TOKEN || '',
    server: sandbox ? 'sandbox' : 'production',
  });
