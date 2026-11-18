import { resolveRequestLocale } from '@tuturuuu/utils/i18n-root-locale';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(
  async ({ locale: localeOverride, requestLocale }) => {
    const locale = resolveRequestLocale(
      routing.locales,
      localeOverride ?? (await requestLocale),
      routing.defaultLocale
    );

    const [{ default: messages }, { default: meetMessages }] =
      await Promise.all([
        import(`../../messages/${locale}.json`),
        import(`../../../meet/messages/${locale}.json`),
      ]);
    const liveTileMessages = Object.fromEntries(
      Object.entries(meetMessages.meet.live).filter(([key]) =>
        key.startsWith('tile_')
      )
    );

    return {
      locale,
      messages: {
        ...messages,
        meet: {
          ...messages.meet,
          call: {
            ...messages.meet.call,
            miraEverywhere: meetMessages.meet.call.miraEverywhere,
          },
          live: { ...messages.meet.live, ...liveTileMessages },
        },
      },
    };
  }
);
