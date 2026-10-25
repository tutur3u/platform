import { getRequestConfig } from 'next-intl/server';

// Playground is an internal English-only app. Satellite providers render
// NextIntlClientProvider, which needs a request config to resolve.
export default getRequestConfig(async () => ({
  locale: 'en',
  messages: {},
}));
