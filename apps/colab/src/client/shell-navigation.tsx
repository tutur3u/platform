import type { SatelliteContentProps } from '@tuturuuu/ui/custom/satellite-content';
import {
  SidebarNavigation,
  satelliteNavigationItemClass,
} from '@tuturuuu/ui/custom/satellite-navigation';
import { useSyncExternalStore } from 'react';
import { useCopy } from './i18n';

const subscribe = (notify: () => void) => {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
};
const currentLocation = () => `${location.search}${location.hash}`;

/** Native navigation adapter; Next satellites supply their prefetch/permissions-aware NavLink. */
export const ShellNavigation: SatelliteContentProps['Navigation'] = ({
  links,
  isCollapsed,
  onClick,
  onSubMenuClick,
}) => {
  const c = useCopy();
  const current = useSyncExternalStore(subscribe, currentLocation, () => '');
  return (
    <SidebarNavigation
      label={c.shellNavigation}
      links={links}
      isCollapsed={isCollapsed}
      renderLink={(link) => {
        const active =
          link.href === '/'
            ? !current.includes('room=')
            : link.href?.startsWith('#') &&
              (current.endsWith(link.href) ||
                (!current.includes('#') && link.href === '#mission'));
        const content = (
          <span className="flex min-w-0 items-center gap-2">
            {link.icon}
            {!isCollapsed && <span className="truncate">{link.title}</span>}
          </span>
        );
        const className = `${satelliteNavigationItemClass({ isCollapsed, isActive: Boolean(active), isDisabled: link.disabled })} border-0 ${active ? '' : 'bg-transparent'} shadow-none`;
        const activate = () => {
          if (link.children) onSubMenuClick(link.children, link.title);
          else link.onClick?.();
          onClick();
        };
        return link.href ? (
          <a
            href={link.href}
            aria-label={link.title}
            title={link.title}
            aria-current={active ? 'page' : undefined}
            className={className}
            onClick={(event) => {
              if (link.onClick || link.children) event.preventDefault();
              activate();
            }}
          >
            {content}
          </a>
        ) : (
          <button
            type="button"
            className={className}
            aria-label={link.title}
            title={link.title}
            disabled={link.disabled}
            onClick={activate}
          >
            {content}
          </button>
        );
      }}
    />
  );
};
