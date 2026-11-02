import type { AbstractIntlMessages } from 'next-intl';

type ServerLocale = 'en' | 'vi';

// Each locale is its own chunk (~430 KB apiece) and loads on first use, so an
// isolate that only serves one locale never parses the other.
const importers: Record<
  ServerLocale,
  () => Promise<{ default: AbstractIntlMessages }>
> = {
  en: () => import('../../messages/en.json'),
  vi: () => import('../../messages/vi.json'),
};
const loaded = new Map<ServerLocale, AbstractIntlMessages>();
const pending = new Map<ServerLocale, Promise<AbstractIntlMessages>>();

function serverLocale(locale: string): ServerLocale {
  return locale === 'vi' ? 'vi' : 'en';
}

/** Messages already loaded in this isolate, for synchronous SSR reads. */
export function peekServerLocaleMessages(
  locale: string
): AbstractIntlMessages | undefined {
  return loaded.get(serverLocale(locale));
}

/** Server-side message bundles; the client fetches the active locale instead. */
export function loadServerLocaleMessages(
  locale: string
): Promise<AbstractIntlMessages> {
  const key = serverLocale(locale);
  const ready = loaded.get(key);
  if (ready) return Promise.resolve(ready);
  let request = pending.get(key);
  if (!request) {
    request = importers[key]().then(
      (module) => {
        loaded.set(key, module.default);
        pending.delete(key);
        return module.default;
      },
      (error: unknown) => {
        pending.delete(key);
        throw error;
      }
    );
    pending.set(key, request);
  }
  return request;
}
