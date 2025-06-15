import DodoPayment from 'dodopayments';

export const payment = new DodoPayment({
  bearerToken: process.env.DODO_API_KEY || '',
  environment: 'test_mode',
});
