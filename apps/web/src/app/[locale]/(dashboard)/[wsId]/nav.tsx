'use client';

import { NavLink } from '@/components/navigation';
import {
  ENABLE_KEYBOARD_SHORTCUTS,
  PROD_MODE,
  ROOT_WORKSPACE_ID,
} from '@/constants/common';
import { cn } from '@/lib/utils';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { buttonVariants } from '@repo/ui/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { DraftingCompass, FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface NavProps {
  wsId: string;
  currentUser: WorkspaceUser | null;
  isCollapsed: boolean;
  links: NavLink[];
  onClick?: () => void;
}

export function Nav({
  wsId,
  currentUser,
  links,
  isCollapsed,
  onClick,
}: NavProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isRootWorkspace = wsId === ROOT_WORKSPACE_ID;
  const [urlToLoad, setUrlToLoad] = useState<string>();

  useEffect(() => {
    if (urlToLoad) setUrlToLoad(undefined);
  }, [pathname, searchParams]);

  function hasFocus(selector: string) {
    return Array.from(document.querySelectorAll(selector)).some(function (el) {
      return el === document.activeElement;
    });
  }

  function parseShortcut(shortcut: string) {
    const parts = shortcut.split('+');
    return {
      ctrl: parts.includes('CTRL'),
      shift: parts.includes('SHIFT'),
      key: parts.find((part) => part.length === 1),
    };
  }

  useEffect(() => {
    function down(e: KeyboardEvent) {
      links.forEach((link) => {
        if (!link.shortcut || !link.href) return;
        const { ctrl, shift, key } = parseShortcut(link.shortcut);
        if (
          !hasFocus('input, select, textarea') &&
          e.key.toUpperCase() === key?.toUpperCase() &&
          ctrl === e.ctrlKey &&
          shift === e.shiftKey
        ) {
          e.preventDefault();
          if (!link.newTab && link.href.split('?')[0] !== pathname)
            setUrlToLoad(link.href.split('?')[0]);
          router.push(link.href);
        }
      });
    }

    if (ENABLE_KEYBOARD_SHORTCUTS) document.addEventListener('keydown', down);

    return () => {
      if (ENABLE_KEYBOARD_SHORTCUTS)
        document.removeEventListener('keydown', down);
    };
  }, [links, pathname]);

  return (
    <div
      data-collapsed={isCollapsed}
      className="group flex flex-col gap-4 py-2 data-[collapsed=true]:py-2"
    >
      <nav className="grid gap-1 px-2 group-[[data-collapsed=true]]:justify-center group-[[data-collapsed=true]]:px-2">
        {links.map((link, index) => {
          // If the link is disabled, don't render it
          if (link?.disabled) return null;

          // If the link is disabled on production, don't render it
          if (link?.disableOnProduction && PROD_MODE) return null;

          // If the link requires root membership, check if user email ends with @tuturuuu.com
          if (
            link?.requireRootMember &&
            !currentUser?.email?.endsWith('@tuturuuu.com')
          )
            return null;

          // If the link requires the root workspace, check if the current workspace is the root workspace
          if (link?.requireRootWorkspace && !isRootWorkspace) return null;

          // If the link is only allowed for certain roles, check if the current role is allowed
          if (link?.allowedRoles && link.allowedRoles.length > 0) return null;

          const links = [...(link.aliases || []), link.href];
          const matchExact = link.matchExact ?? false;

          const isActive =
            links
              .map((href) =>
                matchExact
                  ? pathname === href
                  : (pathname?.startsWith(href) ?? false)
              )
              .filter(Boolean).length > 0;

          return isCollapsed ? (
            <Tooltip key={index} delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  scroll={false}
                  href={{
                    pathname: link.href,
                    query: link.forceRefresh ? { refresh: true } : undefined,
                  }}
                  className={cn(
                    buttonVariants({
                      variant: isActive ? 'secondary' : 'ghost',
                      size: 'icon',
                    }),
                    'h-9 w-9 max-sm:hover:bg-transparent',
                    urlToLoad === link.href &&
                      'bg-accent text-accent-foreground animate-pulse'
                  )}
                  onClick={() => {
                    if (!link.newTab && link.href.split('?')[0] !== pathname)
                      setUrlToLoad(link.href.split('?')[0]);
                    onClick?.();
                  }}
                >
                  {link.icon}
                  <span className="sr-only">{link.title}</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className={cn(
                  'flex items-center gap-4',
                  ((ENABLE_KEYBOARD_SHORTCUTS && link.shortcut) ||
                    link.experimental) &&
                    'flex-col items-start gap-1'
                )}
              >
                {link.title}
                {((ENABLE_KEYBOARD_SHORTCUTS && link.shortcut) ||
                  link.trailing ||
                  link.experimental) && (
                  <span
                    className={cn(
                      'text-muted-foreground',
                      (ENABLE_KEYBOARD_SHORTCUTS && link.shortcut) ||
                        link.experimental
                        ? 'bg-foreground/5 rounded-lg border px-2 py-0.5'
                        : 'ml-auto'
                    )}
                  >
                    {ENABLE_KEYBOARD_SHORTCUTS && link.shortcut
                      ? // replaces 'CTRL' with '⌘' and 'SHIFT' with '⇧'
                        // removes all '+' characters
                        link.shortcut
                          .replace('CTRL', '⌘')
                          .replace('SHIFT', '⇧')
                          .replace(/\+/g, '')
                      : link.trailing ||
                        (link.experimental && (
                          <div className="flex items-center gap-1">
                            {link.experimental === 'alpha' ? (
                              <DraftingCompass className="h-2 w-2 flex-none" />
                            ) : (
                              <FlaskConical className="h-2 w-2 flex-none" />
                            )}
                            <span className="line-clamp-1 break-all text-xs font-semibold">
                              {t(`common.${link.experimental}`)}
                            </span>
                          </div>
                        ))}
                  </span>
                )}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Link
              key={index}
              href={{
                pathname: link.href,
                query: link.forceRefresh ? { refresh: true } : undefined,
              }}
              className={cn(
                buttonVariants({
                  variant: isActive ? 'secondary' : 'ghost',
                  size: 'sm',
                }),
                urlToLoad === link.href &&
                  'bg-accent text-accent-foreground animate-pulse',
                'justify-between gap-2 max-sm:hover:bg-transparent'
              )}
              onClick={() => {
                if (!link.newTab && link.href.split('?')[0] !== pathname)
                  setUrlToLoad(link.href.split('?')[0]);
                onClick?.();
              }}
            >
              <div className="flex items-center">
                {link.icon && (
                  <>
                    {link.icon}
                    <span className="w-2" />
                  </>
                )}
                {link.title}
              </div>
              {((ENABLE_KEYBOARD_SHORTCUTS && link.shortcut) ||
                link.trailing ||
                link.experimental) && (
                <span
                  className={cn(
                    'text-muted-foreground',
                    isActive && 'bg-background text-foreground',
                    ENABLE_KEYBOARD_SHORTCUTS && link.shortcut
                      ? 'bg-foreground/5 hidden rounded-lg border px-2 py-0.5 md:block'
                      : 'ml-auto',
                    link.experimental && 'bg-transparent'
                  )}
                >
                  {ENABLE_KEYBOARD_SHORTCUTS && link.shortcut
                    ? // replaces 'CTRL' with '⌘' and 'SHIFT' with '⇧'
                      // removes all '+' characters
                      link.shortcut
                        .replace('CTRL', '⌘')
                        .replace('SHIFT', '⇧')
                        .replace(/\+/g, '')
                    : link.trailing ||
                      (link.experimental && (
                        <div className="flex items-center gap-1">
                          {link.experimental === 'alpha' ? (
                            <DraftingCompass className="h-2 w-2 flex-none" />
                          ) : (
                            <FlaskConical className="h-2 w-2 flex-none" />
                          )}
                          <span className="line-clamp-1 break-all text-xs font-semibold">
                            {t(`common.${link.experimental}`)}
                          </span>
                        </div>
                      ))}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
