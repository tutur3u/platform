import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-start/server-only', () => ({}));

import enMessages from '../../messages/en.json';
import { getMessages, getTranslations } from './intl-server';
import { withCalendarRequest } from './request-context';

function inRequest<T>(path: string, headers: HeadersInit, run: () => T): T {
  return withCalendarRequest(
    {
      request: new Request(`https://calendar.test${path}`, { headers }),
      responseHeaders: new Headers(),
      waitUntil: () => {},
    },
    run
  );
}

describe('Calendar server translations', () => {
  it('uses the Vietnamese path for a string namespace despite an English cookie', async () => {
    await inRequest('/vi/personal', { cookie: 'NEXT_LOCALE=en' }, async () => {
      const t = await getTranslations('common');

      expect(t('cancel')).toBe('Hủy bỏ');
    });
  });

  it('uses an explicit English locale instead of the Vietnamese request locale', async () => {
    await inRequest('/vi/personal', { cookie: 'NEXT_LOCALE=vi' }, async () => {
      const t = await getTranslations({ locale: 'en', namespace: 'common' });

      expect(t('cancel')).toBe('Cancel');
    });
  });

  it('uses the request locale for an object namespace without a locale', async () => {
    await inRequest('/vi/personal', { cookie: 'NEXT_LOCALE=en' }, async () => {
      const t = await getTranslations({ namespace: 'common' });

      expect(t('cancel')).toBe('Hủy bỏ');
    });
  });

  it('translates from the message root when options are absent', async () => {
    await inRequest('/en/personal', { cookie: 'NEXT_LOCALE=vi' }, async () => {
      const t = await getTranslations();

      expect(t('common.cancel')).toBe('Cancel');
    });
  });

  it('translates an explicit Vietnamese locale outside a request context', async () => {
    const t = await getTranslations({ locale: 'vi', namespace: 'common' });

    expect(t('cancel')).toBe('Hủy bỏ');
  });

  it('rejects implicit locale lookup outside a request context', async () => {
    await expect(getTranslations('common')).rejects.toThrow(
      'Calendar request context is unavailable'
    );
  });

  it('returns the actual English message object for an English request', async () => {
    await inRequest('/en/personal', { cookie: 'NEXT_LOCALE=vi' }, async () => {
      expect(await getMessages()).toBe(enMessages);
    });
  });
});
