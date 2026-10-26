import type { ComponentProps } from 'react';
import { createLocalizedPaths, type Href } from '../intl/localized-path';
import { getLocale } from '../intl/next-intl-server';
import type { BridgeRouting } from '../intl/routing';
import Link from '../next/link';
import { permanentRedirect, redirect } from './navigation';

/**
 * `next-intl/navigation` inside the RSC environment. The router-mode module
 * is a client module, so a server component would receive client references;
 * here `Link` localizes on the server and renders the client link, while the
 * hooks stay client-only.
 */
export function createNavigation<const Locales extends readonly string[]>(
  routing: BridgeRouting<Locales>
) {
  const { getPathname } = createLocalizedPaths(routing);

  async function LocalizedLink({
    href,
    locale,
    ...props
  }: Omit<ComponentProps<typeof Link>, 'href' | 'locale'> & {
    href: Href;
    locale?: string;
  }) {
    const current = locale ?? (await getLocale());
    return <Link {...props} href={getPathname({ href, locale: current })} />;
  }

  const clientOnly = (name: string) => () => {
    throw new Error(
      `${name}() is a client hook; call it from a 'use client' module`
    );
  };

  return {
    Link: LocalizedLink,
    getPathname,
    redirect: (args: { href: Href; locale: string }): never =>
      redirect(getPathname(args)),
    permanentRedirect: (args: { href: Href; locale: string }): never =>
      permanentRedirect(getPathname(args)),
    usePathname: clientOnly('usePathname'),
    useRouter: clientOnly('useRouter'),
  };
}
