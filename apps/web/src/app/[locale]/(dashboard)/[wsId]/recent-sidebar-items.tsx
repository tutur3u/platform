'use client';

import {
  Banknote,
  ChevronDown,
  ChevronUp,
  FolderKanban,
  History,
  LayoutDashboard,
  PencilRuler,
  ReceiptText,
  Trash2,
  Wallet,
  X,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import {
  RECENT_SIDEBAR_VISIT_EVENT,
  type RecentSidebarIconKey,
  type RecentSidebarVisitPayload,
} from '@tuturuuu/ui/tu-do/shared/recent-sidebar-events';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  normalizeRecentSidebarEntries,
  normalizeRecentSidebarHref,
  type RecentSidebarEntry,
  removeRecentSidebarEntry,
  resolveRecentSidebarEntry,
  resolveRecentSidebarItem,
  upsertRecentSidebarEntry,
} from './recent-sidebar-items.utils';

const RECENT_SIDEBAR_ITEMS_EVENT = 'tuturuuu:sidebar-recent-items-updated';

interface RecentSidebarItemsProps {
  isCollapsed: boolean;
  links: (NavLink | null)[];
  onNavigate: () => void;
  wsId: string;
}

interface RecentSidebarEventDetail {
  storageKey: string;
}

function getStorageKey(wsId: string): string {
  return `tuturuuu:sidebar-recent-items:${wsId}`;
}

function readEntries(storageKey: string): RecentSidebarEntry[] {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return [];

    const parsed = JSON.parse(value) as RecentSidebarEntry[];
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry) =>
            entry &&
            typeof entry.href === 'string' &&
            typeof entry.visitedAt === 'string'
        )
      : [];
  } catch {
    return [];
  }
}

function writeEntries(storageKey: string, entries: RecentSidebarEntry[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(entries));
  window.dispatchEvent(
    new CustomEvent<RecentSidebarEventDetail>(RECENT_SIDEBAR_ITEMS_EVENT, {
      detail: { storageKey },
    })
  );
}

function getIcon(iconKey: RecentSidebarIconKey): ReactNode {
  switch (iconKey) {
    case 'task':
      return <LayoutDashboard className="h-4 w-4" />;
    case 'task-board':
      return <FolderKanban className="h-4 w-4" />;
    case 'whiteboard':
      return <PencilRuler className="h-4 w-4" />;
    case 'wallet':
      return <Wallet className="h-4 w-4" />;
    case 'invoice':
      return <ReceiptText className="h-4 w-4" />;
    case 'transaction':
      return <Banknote className="h-4 w-4" />;
    case 'project':
      return <FolderKanban className="h-4 w-4" />;
    case 'template':
      return <LayoutDashboard className="h-4 w-4" />;
    case 'debt':
      return <Banknote className="h-4 w-4" />;
    default:
      return <History className="h-4 w-4" />;
  }
}

export function RecentSidebarItems({
  wsId,
  links,
  isCollapsed,
  onNavigate,
}: RecentSidebarItemsProps) {
  const pathname = usePathname();
  const t = useTranslations();
  const [entries, setEntries] = useState<RecentSidebarEntry[]>([]);
  const [showAll, setShowAll] = useState(false);
  const storageKey = getStorageKey(wsId);

  const debtItemLabel = t('sidebar_recent_items.debt_item');
  const archivedBadgeLabel = t('common.archived');
  const boardBadgeLabel = t('sidebar_recent_items.board_badge');
  const invoiceItemLabel = t('sidebar_recent_items.invoice_item');
  const projectItemLabel = t('sidebar_recent_items.project_item');
  const taskBoardItemLabel = t('sidebar_recent_items.task_board_item');
  const taskItemLabel = t('sidebar_recent_items.task_item');
  const templateItemLabel = t('sidebar_recent_items.template_item');
  const transactionItemLabel = t('sidebar_recent_items.transaction_item');
  const walletItemLabel = t('sidebar_recent_items.wallet_item');
  const whiteboardItemLabel = t('sidebar_recent_items.whiteboard_item');
  const showLessLabel = t('sidebar_recent_items.show_less');

  const loadEntries = useCallback(() => {
    const storedEntries = readEntries(storageKey);
    const normalizedEntries = normalizeRecentSidebarEntries(storedEntries, {
      currentPathname: pathname,
      wsId,
    });

    setEntries(normalizedEntries);

    if (JSON.stringify(storedEntries) !== JSON.stringify(normalizedEntries)) {
      writeEntries(storageKey, normalizedEntries);
    }
  }, [pathname, storageKey, wsId]);

  const resolveItem = useCallback(
    (href: string) =>
      resolveRecentSidebarItem(href, links, {
        archivedBadge: archivedBadgeLabel,
        debtItem: debtItemLabel,
        invoiceItem: invoiceItemLabel,
        projectItem: projectItemLabel,
        taskBoardItem: taskBoardItemLabel,
        taskItem: taskItemLabel,
        templateItem: templateItemLabel,
        transactionItem: transactionItemLabel,
        walletItem: walletItemLabel,
        whiteboardItem: whiteboardItemLabel,
      }),
    [
      archivedBadgeLabel,
      debtItemLabel,
      invoiceItemLabel,
      links,
      projectItemLabel,
      taskBoardItemLabel,
      taskItemLabel,
      templateItemLabel,
      transactionItemLabel,
      walletItemLabel,
      whiteboardItemLabel,
    ]
  );

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      loadEntries();
    };

    const handleRecentItemsUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<RecentSidebarEventDetail>;
      if (customEvent.detail?.storageKey !== storageKey) return;
      loadEntries();
    };

    const handleRecentVisit = (event: Event) => {
      const customEvent = event as CustomEvent<RecentSidebarVisitPayload>;
      if (customEvent.detail?.scopeWsId !== wsId || !customEvent.detail?.href) {
        return;
      }

      const nextEntries = upsertRecentSidebarEntry(readEntries(storageKey), {
        href: normalizeRecentSidebarHref(customEvent.detail.href, {
          currentPathname: pathname,
          wsId,
        }),
        snapshot: customEvent.detail.snapshot,
        visitedAt: new Date().toISOString(),
      });

      setEntries(nextEntries);
      writeEntries(storageKey, nextEntries);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(
      RECENT_SIDEBAR_ITEMS_EVENT,
      handleRecentItemsUpdate as EventListener
    );
    window.addEventListener(
      RECENT_SIDEBAR_VISIT_EVENT,
      handleRecentVisit as EventListener
    );

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(
        RECENT_SIDEBAR_ITEMS_EVENT,
        handleRecentItemsUpdate as EventListener
      );
      window.removeEventListener(
        RECENT_SIDEBAR_VISIT_EVENT,
        handleRecentVisit as EventListener
      );
    };
  }, [loadEntries, pathname, storageKey, wsId]);

  useEffect(() => {
    const resolvedItem = resolveItem(pathname);
    if (!resolvedItem) return;

    const currentEntries = normalizeRecentSidebarEntries(
      readEntries(storageKey),
      {
        currentPathname: pathname,
        wsId,
      }
    );
    const nextEntries = upsertRecentSidebarEntry(
      currentEntries,
      normalizeRecentSidebarHref(resolvedItem.href, {
        currentPathname: pathname,
        wsId,
      }),
      new Date().toISOString()
    );

    const serializedCurrent = JSON.stringify(currentEntries);
    const serializedNext = JSON.stringify(nextEntries);
    if (serializedCurrent === serializedNext) return;

    setEntries(nextEntries);
    writeEntries(storageKey, nextEntries);
  }, [pathname, resolveItem, storageKey, wsId]);

  const resolvedItems = entries
    .map((entry) =>
      resolveRecentSidebarEntry(entry, links, {
        archivedBadge: archivedBadgeLabel,
        debtItem: debtItemLabel,
        invoiceItem: invoiceItemLabel,
        projectItem: projectItemLabel,
        taskBoardItem: taskBoardItemLabel,
        taskItem: taskItemLabel,
        templateItem: templateItemLabel,
        transactionItem: transactionItemLabel,
        walletItem: walletItemLabel,
        whiteboardItem: whiteboardItemLabel,
      })
    )
    .filter((item) => item?.href !== pathname)
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({
      ...item,
      badges:
        item.badges.length === 0 && item.iconKey === 'task-board'
          ? [{ label: boardBadgeLabel, tone: 'default' as const }]
          : item.badges,
    }));
  const hasOverflow = resolvedItems.length > 3;
  const expandedCount = Math.min(resolvedItems.length, 10);
  const visibleItems = showAll
    ? resolvedItems.slice(0, 10)
    : resolvedItems.slice(0, 3);
  const hiddenCount = Math.max(expandedCount - 3, 0);

  useEffect(() => {
    if (!hasOverflow && showAll) {
      setShowAll(false);
    }
  }, [hasOverflow, showAll]);

  if (resolvedItems.length === 0) return null;

  const clearAll = () => {
    setShowAll(false);
    setEntries([]);
    writeEntries(storageKey, []);
  };

  const removeItem = (href: string) => {
    const nextEntries = removeRecentSidebarEntry(readEntries(storageKey), href);
    setEntries(nextEntries);
    writeEntries(storageKey, nextEntries);
  };

  if (isCollapsed) {
    return (
      <div className="px-2 pt-1 pb-2">
        <div className="flex flex-col items-center gap-1 border-border/50 border-t pt-2">
          {resolvedItems.slice(0, 3).map((item) => (
            <Tooltip key={item.href} delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  {getIcon(item.iconKey)}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="space-y-1">
                  <p className="font-medium">{item.title}</p>
                  {item.badges.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {item.badges.map((badge) => (
                        <span
                          key={`${item.href}-${badge.label}`}
                          className={cn(
                            'rounded-full border px-1.5 py-0.5 font-medium text-[10px]',
                            badge.tone === 'feature' &&
                              'border-foreground/10 bg-foreground/10 text-foreground',
                            badge.tone === 'warning' &&
                              'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
                            badge.tone === 'default' &&
                              'border-border bg-background text-muted-foreground'
                          )}
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  ) : item.subtitle ? (
                    <p className="text-muted-foreground text-xs">
                      {item.subtitle}
                    </p>
                  ) : null}
                </div>
              </TooltipContent>
            </Tooltip>
          ))}

          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={clearAll}
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">{t('common.clear_all')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <span>{t('common.clear_all')}</span>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  }

  return (
    <div className="px-2 pt-1 pb-2">
      <section className="border-border/50 border-t pt-2">
        <div className="mb-1.5 flex items-center gap-2 px-2">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="line-clamp-1 min-w-0 flex-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
            {t('sidebar_recent_items.title')}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 rounded-md px-2 text-muted-foreground text-xs hover:text-foreground"
            onClick={clearAll}
          >
            {t('common.clear_all')}
          </Button>
        </div>

        <div className="space-y-0.5">
          {visibleItems.map((item) => (
            <div key={item.href} className="group/item relative">
              <Link
                href={item.href}
                onClick={onNavigate}
                className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 pr-2 transition hover:bg-accent/70"
              >
                <div className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-foreground/5 text-muted-foreground">
                  {getIcon(item.iconKey)}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="line-clamp-1 font-medium text-[13px] leading-4">
                    {item.title}
                  </p>
                  {item.badges.length > 0 ? (
                    <div className="flex flex-wrap gap-1 pr-7">
                      {item.badges.map((badge) => (
                        <span
                          key={`${item.href}-${badge.label}`}
                          className={cn(
                            'rounded-full border px-1.5 py-0.5 font-medium text-[10px] leading-none',
                            badge.tone === 'feature' &&
                              'border-foreground/10 bg-foreground/10 text-foreground',
                            badge.tone === 'warning' &&
                              'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
                            badge.tone === 'default' &&
                              'border-border/70 bg-background/80 text-muted-foreground'
                          )}
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  ) : item.subtitle ? (
                    <p className="line-clamp-1 text-[11px] text-muted-foreground">
                      {item.subtitle}
                    </p>
                  ) : null}
                </div>
              </Link>

              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2 rounded-md bg-background/90 text-muted-foreground opacity-0 shadow-sm transition hover:text-foreground focus-visible:opacity-100 group-hover/item:opacity-100"
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  event.preventDefault();
                  event.stopPropagation();
                  removeItem(item.href);
                }}
              >
                <X className="h-3.5 w-3.5" />
                <span className="sr-only">{t('common.remove')}</span>
              </Button>
            </div>
          ))}

          {hasOverflow && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start gap-1.5 rounded-lg px-2 text-muted-foreground text-xs hover:text-foreground"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  {showLessLabel}
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  {t('sidebar_recent_items.show_more', { count: hiddenCount })}
                </>
              )}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
