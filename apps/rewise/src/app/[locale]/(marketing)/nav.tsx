'use client';

import ChatLink from './chat-link';
import { NavLink } from '@/components/navigation';
import { PROD_MODE } from '@/constants/common';
import { cn } from '@/lib/utils';
import { Button } from '@repo/ui/components/ui/button';
import { Checkbox } from '@repo/ui/components/ui/checkbox';
import { Separator } from '@repo/ui/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { WorkspaceUser } from '@tutur3u/types/primitives/WorkspaceUser';
import { CirclePlus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  links: NavLink[],
  configs: {
    showChatName: boolean;
    showFavorites: boolean;
  }
): GroupedLinks {
  return links.reduce((acc: GroupedLinks, link) => {
    if (configs.showFavorites && link.pinned) {
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [urlToLoad, setUrlToLoad] = useState<string>();
  const [configs, setConfigs] = useState({
    showChatName: true,
    showFavorites: true,
  });

  const groupedLinks = groupLinksByDate(locale, t, links, configs);

  useEffect(() => {
    if (urlToLoad && urlToLoad === pathname) setUrlToLoad(undefined);
  }, [pathname, searchParams]);

  const renderLink = (
    link: NavLink,
    configs: {
      showChatName: boolean;
      showFavorites: boolean;
    }
  ) => {
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
      <Tooltip key={link.href} delayDuration={0}>
        <TooltipTrigger asChild>
          <ChatLink
            single={single}
            isActive={isActive}
            isCollapsed={isCollapsed}
            link={link}
            urlToLoad={urlToLoad}
            onClick={() => {
              if (link.disabled || link.newTab) return;
              setUrlToLoad(link.href.split('?')[0]);
              onClick?.();
            }}
          />
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-4">
          <div>
            <div className="font-semibold">
              {configs.showChatName
                ? link.title.replaceAll(/(\*\*)|(^")|("$)/g, '')
                : t('ai_chat.anonymous')}
            </div>
            {link.createdAt && (
              <span className="text-sm text-muted-foreground">
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
        key={link.href}
        single={single}
        isActive={isActive}
        isCollapsed={isCollapsed}
        link={link}
        urlToLoad={urlToLoad}
        onClick={() => {
          if (link.disabled || link.newTab) return;
          setUrlToLoad(link.href.split('?')[0]);
          onClick?.();
        }}
        configs={configs}
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
                href="/new"
                className="flex items-center justify-start"
                onClick={() => {
                  onClick?.();
                }}
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
            href="/new"
            className="mt-2 flex items-center justify-start"
            onClick={() => {
              router.push('/new');
              router.refresh();
              onClick?.();
            }}
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
            {links.map((link) => renderLink(link, configs))}
          </div>
        ) : (
          <>
            {links.length === 0 || (
              <>
                <Separator />
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-chat-name"
                    checked={configs.showChatName}
                    onCheckedChange={(checked) =>
                      setConfigs((prev) => ({
                        ...prev,
                        showChatName: Boolean(checked),
                      }))
                    }
                  />
                  <label
                    htmlFor="show-chat-name"
                    className="line-clamp-1 text-sm leading-none font-medium break-all peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {t('ai_chat.show_chat_name')}
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-favorites"
                    checked={configs.showFavorites}
                    onCheckedChange={(checked) =>
                      setConfigs((prev) => ({
                        ...prev,
                        showFavorites: Boolean(checked),
                      }))
                    }
                  />
                  <label
                    htmlFor="show-favorites"
                    className="line-clamp-1 text-sm leading-none font-medium break-all peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {t('ai_chat.show_favorites')}
                  </label>
                </div>
              </>
            )}

            <Separator />

            {configs.showFavorites &&
              Object.entries(groupedLinks).map(([dateTag, dateLinks]) => {
                if (dateTag === 'Favorites') {
                  return (
                    <>
                      <div key={dateTag}>
                        {!isCollapsed && (
                          <div className="mb-2 text-sm font-semibold text-muted-foreground">
                            {dateTag.charAt(0).toUpperCase() + dateTag.slice(1)}
                          </div>
                        )}
                        <div className="grid gap-1">
                          {dateLinks.map((link) => renderLink(link, configs))}
                        </div>
                      </div>
                      <Separator />
                    </>
                  );
                }
              })}
            {links.length === 0 ? (
              <div className="flex items-center justify-center text-center opacity-50">
                {t('ai_chat.no_chats_yet')}
              </div>
            ) : (
              Object.entries(groupedLinks).map(([dateTag, dateLinks]) => {
                if (!configs.showFavorites || dateTag !== 'Favorites') {
                  return (
                    <div key={dateTag}>
                      {!isCollapsed && (
                        <div className="mb-2 text-sm font-semibold text-muted-foreground">
                          {dateTag.charAt(0).toUpperCase() + dateTag.slice(1)}
                        </div>
                      )}
                      <div className="grid gap-1">
                        {dateLinks.map((link) => renderLink(link, configs))}
                      </div>
                    </div>
                  );
                }
              })
            )}
          </>
        )}
      </nav>
    </div>
  );
}
