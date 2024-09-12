'use client';

import ChatLink from './chat-link';
import { NavLink } from '@/components/navigation';
import { PROD_MODE } from '@/constants/common';
import { cn } from '@/lib/utils';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { Button } from '@repo/ui/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { CirclePlus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface NavProps {
  t: any;
  locale: string;
  currentUser: WorkspaceUser | null;
  isCollapsed: boolean;
  links: NavLink[];
  single: boolean;
  className?: string;
  onClick?: () => void;
}

interface GroupedLinks {
  [key: string]: NavLink[];
}

function getDateTag(locale: string, t: any, date: Date): string {
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t('date_helper.today');
  if (diffDays === 1) return t('date_helper.yesterday');
  if (diffDays <= 7) return `${diffDays} ${t('date_helper.days_ago')}`;
  if (diffDays <= 30) return t('date_helper.this_month');
  return date.toLocaleString(locale, { month: 'long', year: 'numeric' });
}

function groupLinksByDate(
  locale: string,
  t: any,
  links: NavLink[]
): GroupedLinks {
  return links.reduce((acc: GroupedLinks, link) => {
    if (link.pinned) {
      if (!acc['Favorites']) {
        acc['Favorites'] = [];
      }
      acc['Favorites'].push(link);
    } else if (link.createdAt) {
      const dateTag = getDateTag(locale, t, new Date(link.createdAt));
      if (!acc[dateTag]) {
        acc[dateTag] = [];
      }
      acc[dateTag].push(link);
    }
    return acc;
  }, {});
}

export function Nav({
  t,
  locale,
  currentUser,
  links,
  isCollapsed,
  single,
  className,
  onClick,
}: NavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [urlToLoad, setUrlToLoad] = useState<string>();

  const groupedLinks = groupLinksByDate(locale, t, links);

  useEffect(() => {
    if (urlToLoad && urlToLoad === pathname) setUrlToLoad(undefined);
  }, [pathname, searchParams]);

  const renderLink = (link: NavLink, index: number) => {
    // If the link is disabled, don't render it
    if (link?.disabled && !link.showDisabled) return null;

    // If the link is disabled on production, don't render it
    if (link?.disableOnProduction && PROD_MODE) return null;

    // If the link requires root membership, check if user email ends with @tuturuuu.com
    if (
      link?.requireRootMember &&
      !currentUser?.email?.endsWith('@tuturuuu.com')
    )
      return null;

    // If the link is only allowed for certain roles, check if the current role is allowed
    if (link?.allowedRoles && link.allowedRoles.length > 0) return null;

    const chatId = searchParams.get('id');

    const isActive = link.aliases
      ? [...link.aliases, link.href].some((href) =>
          chatId
            ? href.endsWith(chatId)
            : link.matchExact
              ? pathname === href
              : pathname?.startsWith(href)
        )
      : chatId
        ? link.href.endsWith(chatId)
        : link.matchExact
          ? pathname === link.href
          : pathname?.startsWith(link.href);

    return isCollapsed ? (
      <Tooltip key={index} delayDuration={0}>
        <TooltipTrigger asChild>
          <ChatLink
            key={index}
            single={single}
            isActive={isActive}
            isCollapsed={isCollapsed}
            link={link}
            urlToLoad={urlToLoad}
            onClick={() => {
              if (link.disabled) return;
              setUrlToLoad(link.href.split('?')[0]);
              onClick?.();
            }}
          />
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-4">
          <div>
            <div className="font-semibold">
              {link.title.replaceAll(/(\*\*)|(^")|("$)/g, '')}
            </div>
            {link.createdAt && (
              <span className="text-muted-foreground text-sm">
                {new Date(link.createdAt).toLocaleString(locale, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    ) : (
      <ChatLink
        key={index}
        single={single}
        isActive={isActive}
        isCollapsed={isCollapsed}
        link={link}
        urlToLoad={urlToLoad}
        onClick={() => {
          if (link.disabled) return;
          setUrlToLoad(link.href.split('?')[0]);
          onClick?.();
        }}
      />
    );
  };

  return (
    <div
      data-collapsed={isCollapsed}
      className={cn(
        'group flex flex-col gap-4 py-2 data-[collapsed=true]:py-2',
        className
      )}
    >
      <nav
        className={cn(
          'grid px-2 group-[[data-collapsed=true]]:justify-center group-[[data-collapsed=true]]:px-2',
          isCollapsed ? 'gap-1' : 'gap-4'
        )}
      >
        {single ? undefined : isCollapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Link
                href={
                  pathname === '/' && !searchParams.get('id')
                    ? '/'
                    : '/?refresh=true'
                }
                className="flex items-center justify-start"
              >
                <Button
                  size={isCollapsed ? 'icon' : undefined}
                  variant="secondary"
                  onClick={onClick}
                  className={cn(isCollapsed || 'w-full')}
                  disabled={pathname === '/' && !searchParams.get('id')}
                >
                  <CirclePlus className="h-6 w-6" />
                  {isCollapsed || (
                    <span className="ml-2">{t('ai_chat.new_chat')}</span>
                  )}
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              <div className="font-semibold">{t('ai_chat.new_chat')}</div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Link
            href={
              pathname === '/' && !searchParams.get('id')
                ? '/'
                : '/?refresh=true'
            }
            className="flex items-center justify-start"
          >
            <Button
              size={isCollapsed ? 'icon' : undefined}
              onClick={onClick}
              className={cn(isCollapsed || 'w-full')}
              disabled={pathname === '/' && !searchParams.get('id')}
            >
              <CirclePlus className="h-6 w-6" />
              {isCollapsed || (
                <span className="ml-2">{t('ai_chat.new_chat')}</span>
              )}
            </Button>
          </Link>
        )}

        {single ? (
          <div className="grid gap-1">
            {links.map((link, index) => renderLink(link, index))}
          </div>
        ) : (
          <>
            {Object.entries(groupedLinks).map(([dateTag, dateLinks]) => {
              if (dateTag === 'Favorites') {
                return (
                  <div key={dateTag}>
                    {!isCollapsed && (
                      <div className="text-muted-foreground mb-2 text-sm font-semibold">
                        {dateTag.charAt(0).toUpperCase() + dateTag.slice(1)}
                      </div>
                    )}
                    <div className="grid gap-1">
                      {dateLinks.map((link, index) => renderLink(link, index))}
                    </div>
                  </div>
                );
              }
            })}
            {Object.entries(groupedLinks).map(([dateTag, dateLinks]) => {
              if (dateTag !== 'Favorites') {
                return (
                  <div key={dateTag}>
                    {!isCollapsed && (
                      <div className="text-muted-foreground mb-2 text-sm font-semibold">
                        {dateTag.charAt(0).toUpperCase() + dateTag.slice(1)}
                      </div>
                    )}
                    <div className="grid gap-1">
                      {dateLinks.map((link, index) => renderLink(link, index))}
                    </div>
                  </div>
                );
              }
            })}
          </>
        )}
      </nav>
    </div>
  );
}
