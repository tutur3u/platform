'use client';

import { BookOpen, Boxes, FileCode2, Package, Search } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Input } from '@tuturuuu/ui/input';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { componentDocs, componentDocsByCategory } from './component-docs';

const topLinks = [
  { key: 'overview', href: '', icon: BookOpen },
  { key: 'setup', href: '/setup', icon: Package },
  { key: 'components', href: '/components', icon: Boxes },
  { key: 'contributing', href: '/contributing', icon: FileCode2 },
] as const;

export function UiDocsSidebar({
  className,
  locale,
  onNavigate,
}: {
  className?: string;
  locale: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations('ui-showcase.docs.nav');
  const tCategories = useTranslations('ui-showcase.categories');
  const pathname = usePathname();
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = useMemo(
    () =>
      componentDocsByCategory
        .map((group) => ({
          ...group,
          docs: group.docs.filter((doc) => {
            if (!normalizedQuery) return true;
            return [
              doc.name,
              doc.id,
              doc.importPath,
              doc.category,
              ...doc.exports,
              ...doc.customizationKeys,
            ]
              .join(' ')
              .toLowerCase()
              .includes(normalizedQuery);
          }),
        }))
        .filter((group) => group.docs.length > 0),
    [normalizedQuery]
  );

  const baseHref = `/${locale}/ui`;

  return (
    <ScrollArea className={cn('h-full', className)}>
      <div className="grid gap-6 p-4">
        <nav className="grid gap-1" data-testid="ui-docs-primary-nav">
          {topLinks.map((item) => {
            const Icon = item.icon;
            const href = `${baseHref}${item.href}`;
            return (
              <SidebarLink
                href={href}
                isActive={isActivePath(pathname, href)}
                key={item.key}
                onNavigate={onNavigate}
              >
                <Icon className="size-4" />
                {t(item.key)}
              </SidebarLink>
            );
          })}
        </nav>

        <div className="grid gap-2">
          <label className="font-medium text-sm" htmlFor="ui-docs-search">
            {t('search')}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              id="ui-docs-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
              value={query}
            />
          </div>
        </div>

        <div className="grid gap-4" data-testid="ui-docs-component-nav">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-sm">{t('components')}</div>
            <Badge variant="secondary">{componentDocs.length}</Badge>
          </div>
          {filteredGroups.length ? (
            filteredGroups.map((group) => (
              <div className="grid gap-1.5" key={group.category}>
                <div className="px-2 font-medium text-muted-foreground text-xs">
                  {tCategories(group.category)}
                </div>
                {group.docs.map((doc) => {
                  const href = `${baseHref}/components/${doc.slug}`;
                  return (
                    <SidebarLink
                      href={href}
                      isActive={isActivePath(pathname, href)}
                      key={doc.id}
                      onNavigate={onNavigate}
                    >
                      <span className="truncate">{doc.name}</span>
                    </SidebarLink>
                  );
                })}
              </div>
            ))
          ) : (
            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
              <div className="font-medium">{t('empty')}</div>
              <p className="mt-1 text-muted-foreground">{t('emptyHint')}</p>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

function SidebarLink({
  children,
  href,
  isActive,
  onNavigate,
}: {
  children: React.ReactNode;
  href: string;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      className={cn(
        'flex min-h-9 items-center gap-2 rounded-md px-2.5 py-2 text-sm transition hover:bg-muted/70 focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-4 focus-visible:ring-ring/10',
        isActive
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
      href={href}
      onClick={onNavigate}
    >
      {children}
    </Link>
  );
}

function isActivePath(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (pathname === href) return true;
  return href.endsWith('/components') ? false : pathname.startsWith(`${href}/`);
}
