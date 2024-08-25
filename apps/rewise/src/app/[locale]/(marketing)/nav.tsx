'use client';

import { NavLink } from '@/components/navigation';
import { PROD_MODE } from '@/constants/common';
import { cn } from '@/lib/utils';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { buttonVariants } from '@repo/ui/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface NavProps {
  currentUser: WorkspaceUser | null;
  isCollapsed: boolean;
  links: NavLink[];
  onClick?: () => void;
}

export function Nav({ currentUser, links, isCollapsed, onClick }: NavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [urlToLoad, setUrlToLoad] = useState<string>();

  useEffect(() => {
    if (urlToLoad) setUrlToLoad(undefined);
  }, [pathname, searchParams]);

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
                  href={
                    link.forceRefresh ? `${link.href}?refresh=true` : link.href
                  }
                  className={cn(
                    buttonVariants({
                      variant: isActive ? 'default' : 'ghost',
                      size: 'icon',
                    }),
                    'h-9 w-9 whitespace-normal',
                    urlToLoad === link.href &&
                      'bg-accent text-accent-foreground animate-pulse'
                  )}
                  onClick={() => {
                    setUrlToLoad(link.href);
                    onClick?.();
                  }}
                >
                  {link.icon}
                  <span className="sr-only">{link.title}</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-4">
                {link.title}
                {link.trailing && (
                  <span className="text-muted-foreground ml-auto">
                    {link.trailing}
                  </span>
                )}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Link
              key={index}
              href={link.forceRefresh ? `${link.href}?refresh=true` : link.href}
              className={cn(
                buttonVariants({
                  variant: isActive ? 'default' : 'ghost',
                  size: 'sm',
                }),
                urlToLoad === link.href &&
                  'bg-accent text-accent-foreground animate-pulse',
                'w-full justify-start whitespace-normal'
              )}
              onClick={() => {
                setUrlToLoad(link.href);
                onClick?.();
              }}
            >
              {/* {link.icon && (
                <>
                  {link.icon}
                  <span className="mr-2" />
                </>
              )} */}
              <span className="line-clamp-1 break-all">{link.title}</span>
              {link.trailing && (
                <span
                  className={cn(
                    'ml-auto flex-none',
                    isActive && 'text-background dark:text-white'
                  )}
                >
                  {link.trailing}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
