// import { Checkout } from '@polar-sh/nextjs';
// export const GET = Checkout({
//   accessToken: process.env.POLAR_ACCESS_TOKEN || '',
//   successUrl: '/success',
//   server: 'sandbox',
// });
import { Polar } from '@polar-sh/sdk';

console.log(process.env.NEXT_PUBLIC_POLAR_ACCESS_TOKEN);
export const api = new Polar({
  accessToken: process.env.NEXT_PUBLIC_POLAR_ACCESS_TOKEN || '',
  server: 'production',
});
