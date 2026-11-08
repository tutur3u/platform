import { getRequestConfig } from '../next-intl-server';

// Mirrors an app's i18n/request.ts (aliased as next-intl/config in tests).
export default getRequestConfig(async ({ locale, requestLocale }) => {
  const resolved = locale ?? (await requestLocale) ?? 'en';
  const current = resolved === 'vi' ? 'vi' : 'en';
  return {
    locale: current,
    messages: {
      common: { hello: current === 'vi' ? 'Xin chào {name}' : 'Hello {name}' },
    },
    timeZone: 'Asia/Ho_Chi_Minh',
  };
});
