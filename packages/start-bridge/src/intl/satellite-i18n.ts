import { redirect as rawRedirect } from 'next/navigation';
import { localize } from './satellite-locales';

/**
 * The `@tuturuuu/satellite/i18n` entry for bridged apps. Locale data and
 * `redirect` come from environment-neutral modules; only the hooks and the
 * link component come from the client module, so a server or RSC import of
 * `routing.locales` is real data, not a client reference. `next/navigation`
 * stays a bare specifier so each environment resolves its own variant.
 */
export {
  defaultLocale,
  type Locale,
  localize,
  routing,
  supportedLocales,
} from './satellite-locales';
export {
  Link,
  LocalizedLink,
  usePathname,
  useRouter,
} from './localized-navigation';

export function redirect({
  href,
  locale,
}: {
  href: string;
  locale: string;
}): never {
  return rawRedirect(localize(href, locale));
}
