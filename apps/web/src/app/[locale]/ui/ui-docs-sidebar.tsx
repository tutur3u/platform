'use client';

import {
  BookOpen,
  Boxes,
  ExternalLink,
  FileCode2,
  FileText,
  Package,
  Search,
  SquareTerminal,
} from '@tuturuuu/icons/lucide-static';
import { Badge } from '@tuturuuu/ui/badge';
import { Input } from '@tuturuuu/ui/input';
import { Kbd } from '@tuturuuu/ui/kbd';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ComponentType, useMemo, useState } from 'react';
import { DOCS_URL } from './links';
import type { SidebarGroup, SidebarLabels } from './ui-docs-nav-data';
import { getAccent } from './ui-docs-theme';

const topLinks = [
  { key: 'overview', href: '', icon: BookOpen },
  { key: 'setup', href: '/setup', icon: Package },
  { key: 'components', href: '/components', icon: Boxes },
  { key: 'contributing', href: '/contributing', icon: FileCode2 },
] as const satisfies ReadonlyArray<{
  key: keyof SidebarLabels;
  href: string;
  icon: ComponentType<{ className?: string }>;
}>;

export function UiDocsSidebarNav({
  className,
  locale,
  groups,
  labels,
  total,
  onNavigate,
  onOpenCommand,
}: {
  className?: string;
  locale: string;
  groups: SidebarGroup[];
  labels: SidebarLabels;
  total: number;
  onNavigate?: () => void;
  onOpenCommand?: () => void;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          `${item.name} ${item.slug}`.toLowerCase().includes(normalizedQuery)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, normalizedQuery]);

  const baseHref = `/${locale}/ui`;

  return (
    <ScrollArea className={cn('h-full', className)}>
      <div className="grid gap-6 p-4">
        {onOpenCommand ? (
          <button
            className="group flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-muted-foreground text-sm transition hover:border-foreground/20 hover:text-foreground"
            onClick={onOpenCommand}
            type="button"
          >
            <SquareTerminal className="size-4" />
            <span className="truncate">{labels.commandTrigger}</span>
            <Kbd className="ml-auto">⌘K</Kbd>
          </button>
        ) : null}

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
                {labels[item.key]}
              </SidebarLink>
            );
          })}
          <a
            className="relative flex min-h-9 items-center gap-2 rounded-md px-2.5 py-2 text-muted-foreground text-sm transition hover:bg-muted/70 hover:text-foreground focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-4 focus-visible:ring-ring/10"
            href={DOCS_URL}
            rel="noreferrer"
            target="_blank"
          >
            <FileText className="size-4" />
            <span className="truncate">{labels.fullDocs}</span>
            <ExternalLink className="ml-auto size-3.5 opacity-60" />
          </a>
        </nav>

        <div className="grid gap-2">
          <label className="font-medium text-sm" htmlFor="ui-docs-search">
            {labels.search}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              id="ui-docs-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.searchPlaceholder}
              value={query}
            />
          </div>
        </div>

        <div className="grid gap-4" data-testid="ui-docs-component-nav">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-sm">{labels.components}</div>
            <Badge variant="secondary">{total}</Badge>
          </div>
          {filteredGroups.length ? (
            filteredGroups.map((group) => {
              const accent = getAccent(group.category);
              return (
                <div className="grid gap-1.5" key={group.category}>
                  <div className="flex items-center gap-2 px-2 font-medium text-muted-foreground text-xs">
                    <span className={cn('size-1.5 rounded-full', accent.dot)} />
                    {group.label}
                  </div>
                  {group.items.map((item) => {
                    const href = `${baseHref}/components/${item.slug}`;
                    return (
                      <SidebarLink
                        href={href}
                        isActive={isActivePath(pathname, href)}
                        key={item.slug}
                        onNavigate={onNavigate}
                      >
                        <span className="truncate">{item.name}</span>
                      </SidebarLink>
                    );
                  })}
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
              <div className="font-medium">{labels.empty}</div>
              <p className="mt-1 text-muted-foreground">{labels.emptyHint}</p>
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
        'relative flex min-h-9 items-center gap-2 rounded-md px-2.5 py-2 text-sm transition hover:bg-muted/70 focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-4 focus-visible:ring-ring/10',
        isActive
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
      href={href}
      onClick={onNavigate}
    >
      {isActive ? (
        <span className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-foreground" />
      ) : null}
      {children}
    </Link>
  );
}

function isActivePath(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (pathname === href) return true;
  return href.endsWith('/components') ? false : pathname.startsWith(`${href}/`);
}
