import { Polar } from '@tuturuuu/payment/polar';

export const api = new Polar({
  accessToken: process.env.NEXT_PUBLIC_POLAR_ACCESS_TOKEN || '',
  server: process.env.NODE_ENV === 'development' ? 'sandbox' : 'production',
});
