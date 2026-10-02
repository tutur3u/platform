'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';

export function WorkspaceNavigation({
  links,
}: {
  links: { href: string; title: string; icon: ReactNode }[];
}) {
  const pathname = usePathname();
  const t = useTranslations('lettin');
  return (
    <nav className="workspace-creative-nav" aria-label={t('studioNavigation')}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname === link.href ? 'page' : undefined}
        >
          {link.icon}
          <span>{link.title}</span>
        </Link>
      ))}
    </nav>
  );
}
