'use client';

import { cn } from '@tuturuuu/utils/format';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { NavLink as NavLinkType } from '@/components/navigation';
import { NavLink } from './nav-link';

interface NavProps {
  wsId: string;
  isCollapsed: boolean;
  links: (NavLinkType | null)[];
  onSubMenuClick: (links: (NavLinkType | null)[], title: string) => void;
  onClick: () => void;
  className?: string;
}

export function Nav({
  wsId,
  links,
  isCollapsed,
  onSubMenuClick,
  onClick,
  className,
}: NavProps) {
  const pathname = usePathname();

  const [urlToLoad, setUrlToLoad] = useState<string>();

  useEffect(() => {
    if (urlToLoad && urlToLoad === pathname) setUrlToLoad(undefined);
  }, [pathname, urlToLoad]);

  if (!links?.length) {
    return null;
  }

  return (
    <div
      data-collapsed={isCollapsed}
      className={cn('group flex flex-col gap-y-0.5 p-2', className)}
    >
      <nav className="grid gap-y-0.5">
        {links.map((link, index) => {
          if (!link) {
            return (
              <div
                key={`nav-divider-${index}`}
                className={cn(
                  'my-1 border-b',
                  isCollapsed ? 'mx-auto w-1/2' : 'w-auto'
                )}
              />
            );
          }

          return (
            <NavLink
              key={`nav-link-${link.href || link.title}-${index}`}
              wsId={wsId}
              link={link}
              isCollapsed={isCollapsed}
              onSubMenuClick={onSubMenuClick}
              onClick={onClick}
            />
          );
        })}
      </nav>
    </div>
  );
}
