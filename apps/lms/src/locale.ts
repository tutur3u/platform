import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

export const loadLocale = createServerFn({ method: 'GET' }).handler(() => {
  const request = getRequest();
  const cookie = request.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)NEXT_LOCALE=(en|vi)(?:;|$)/u)?.[1];
  if (cookie === 'en' || cookie === 'vi') return cookie;
  const preferences = (request.headers.get('accept-language') ?? '')
    .split(',')
    .map((part) => {
      const [tag = '', quality] = part.trim().split(';');
      return {
        locale: tag.toLowerCase().split('-')[0],
        weight: quality ? Number(quality.trim().slice(2)) : 1,
      };
    })
    .filter(({ weight }) => weight > 0 && weight <= 1)
    .sort((a, b) => b.weight - a.weight);
  return preferences.find(({ locale }) => locale === 'en' || locale === 'vi')
    ?.locale === 'vi'
    ? 'vi'
    : 'en';
});
