import { Polar } from '@tuturuuu/payment/polar';

export const createPolarClient = ({ sandbox = false }: { sandbox?: boolean }) =>
  new Polar({
    accessToken: process.env.NEXT_PUBLIC_POLAR_ACCESS_TOKEN || '',
    server: sandbox ? 'sandbox' : 'production',
  });
