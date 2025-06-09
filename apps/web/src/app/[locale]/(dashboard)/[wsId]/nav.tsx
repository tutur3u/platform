'use client';

import { NavLink } from './nav-link';
import { NavLink as NavLinkType } from '@/components/navigation';
import { ENABLE_KEYBOARD_SHORTCUTS } from '@/constants/common';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface NavProps {
  wsId: string;
  isCollapsed: boolean;
  links: (NavLinkType | null)[];
  // eslint-disable-next-line no-unused-vars
  onSubMenuClick: (links: NavLinkType[], title: string) => void;
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [urlToLoad, setUrlToLoad] = useState<string>();

  useEffect(() => {
    if (urlToLoad && urlToLoad === pathname) setUrlToLoad(undefined);
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
        if (!link || !link.shortcut || !link.href) return;
        const { ctrl, shift, key } = parseShortcut(link.shortcut);
        if (
          !hasFocus('input, select, textarea') &&
          e.key.toUpperCase() === key?.toUpperCase() &&
          ctrl === e.ctrlKey &&
          shift === e.shiftKey
        ) {
          e.preventDefault();
          if (link.href.split('?')[0] !== pathname)
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

  if (!links?.length) {
    return null;
  }

  return (
    <div
      data-collapsed={isCollapsed}
      className={cn('group flex flex-col gap-y-1 p-2', className)}
    >
      <nav className="grid gap-y-1">
        {links.map((link, index) => {
          if (!link) {
            return (
              <div
                key={index}
                className={cn(
                  'my-2 ml-4 border-b',
                  isCollapsed ? 'mx-auto w-1/2' : 'w-auto'
                )}
              />
            );
          }

          return (
            <NavLink
              key={link.href || index}
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
