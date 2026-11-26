'use client';
import { usePathname } from 'next/navigation';
import { NavLink } from './nav-link';
import type { NavLink as NavLinkType } from './navigation';
import { SidebarNavigation } from './satellite-navigation';

interface NavProps {
  wsId: string;
  isCollapsed: boolean;
  links: (NavLinkType | null)[];
  onSubMenuClick: (links: (NavLinkType | null)[], title: string) => void;
  onClick: () => void;
  className?: string;
  collapsibleSections?: boolean;
  pathname?: string;
}
export function Nav({
  wsId,
  links,
  isCollapsed,
  onSubMenuClick,
  onClick,
  className,
  collapsibleSections,
  pathname,
}: NavProps) {
  const routerPathname = usePathname();
  return (
    <SidebarNavigation
      links={links}
      isCollapsed={isCollapsed}
      className={className}
      collapsibleSections={collapsibleSections}
      pathname={pathname ?? routerPathname ?? ''}
      renderLink={(link) => (
        <NavLink
          wsId={wsId}
          link={link}
          isCollapsed={isCollapsed}
          onSubMenuClick={onSubMenuClick}
          onClick={onClick}
        />
      )}
    />
  );
}
