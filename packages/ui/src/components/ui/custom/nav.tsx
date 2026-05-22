'use client';

import { cn } from '@tuturuuu/utils/format';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NavLink } from './nav-link';
import type { NavLink as NavLinkType } from './navigation';

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

          const previousSectionLabel = links
            .slice(0, index)
            .reverse()
            .find((previousLink) => previousLink)?.sectionLabel;
          const shouldShowSectionLabel =
            link.sectionLabel && link.sectionLabel !== previousSectionLabel;

          return (
            <div key={`nav-item-${link.href || link.title}-${index}`}>
              {shouldShowSectionLabel && !isCollapsed && (
                <div className="px-2 pt-3 pb-1 first:pt-0">
                  <span className="font-semibold text-[11px] text-muted-foreground/80 uppercase tracking-wider">
                    {link.sectionLabel}
                  </span>
                </div>
              )}
              <NavLink
                wsId={wsId}
                link={link}
                isCollapsed={isCollapsed}
                onSubMenuClick={onSubMenuClick}
                onClick={onClick}
              />
            </div>
          );
        })}
      </nav>
    </div>
  );
}
