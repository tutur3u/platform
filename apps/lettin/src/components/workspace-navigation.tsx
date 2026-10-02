'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';

type NavigationLink = {
  href: string;
  title: string;
  icon: ReactNode;
  aliases?: string[];
  children?: string[];
};

export function activeWorkspaceLink(pathname: string, links: NavigationLink[]) {
  return links
    .filter((link) => {
      const workspaceRoot = `/${link.href.split('/')[1]}`;
      const paths = [
        link.href,
        ...(link.children ?? []),
        ...(link.aliases ?? []).map((alias) => `${workspaceRoot}/${alias}`),
      ];
      return paths.some(
        (path) =>
          pathname === path ||
          (path !== workspaceRoot && pathname.startsWith(`${path}/`))
      );
    })
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function WorkspaceNavigation({ links }: { links: NavigationLink[] }) {
  const pathname = usePathname();
  const t = useTranslations('lettin');
  const activeHref = activeWorkspaceLink(pathname, links);
  return (
    <nav className="workspace-creative-nav" aria-label={t('studioNavigation')}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={activeHref === link.href ? 'page' : undefined}
        >
          {link.icon}
          <span>{link.title}</span>
        </Link>
      ))}
    </nav>
  );
}
