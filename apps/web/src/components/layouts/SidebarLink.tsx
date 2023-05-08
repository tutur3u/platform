import { Tooltip } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAppearance } from '../../hooks/useAppearance';
import { DEV_MODE } from '../../constants/common';
import { closeSidebarOnMobile } from '../../utils/responsive-helper';

interface SidebarLinkProps {
  href?: string;
  onClick?: () => void;
  label?: string;
  activeIcon?: React.ReactNode;
  inactiveIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  showIcon?: boolean;
  showLabel?: boolean;
  showTooltip?: boolean;
  enableOffset?: boolean;
  defaultActive?: boolean;
  defaultHighlight?: boolean;
  left?: boolean;
  classNames?: {
    root?: string;
    innerRoot?: string;
  };
  exactMatch?: boolean;
  disableAutoClose?: boolean;
  disabled?: boolean;
}

export default function SidebarLink({
  href,
  onClick,
  label,
  activeIcon,
  inactiveIcon,
  trailingIcon,
  showIcon = true,
  showLabel = true,
  showTooltip = false,
  defaultActive = true,
  defaultHighlight = true,
  left = false,
  classNames,
  exactMatch = false,
  disableAutoClose = false,
  disabled = false,
}: SidebarLinkProps) {
  const router = useRouter();
  const { wsId, teamId } = router.query;

  const { sidebar, setSidebar, hideExperimental } = useAppearance();

  const isExpanded = sidebar === 'open';

  const enhancedPath = router.pathname
    .replace('/[teamId]', `/${teamId}`)
    .replace('/[wsId]', `/${wsId}`);

  const isActive = href
    ? exactMatch
      ? enhancedPath === href
      : enhancedPath.startsWith(href)
    : false;

  if (disabled && (!DEV_MODE || (DEV_MODE && hideExperimental))) return null;

  return (
    <Link
      href={disabled ? '#' : href || '#'}
      onClick={(e) => {
        if (disabled) e.preventDefault();
        if (onClick) onClick();
        closeSidebarOnMobile({ window, setSidebar, disableAutoClose });
      }}
      className={`font-semibold ${classNames?.root}`}
    >
      <Tooltip
        label={label}
        position="right"
        offset={16}
        disabled={!showTooltip}
      >
        <div
          className={`flex items-center gap-2 rounded p-2 ${
            disabled
              ? 'cursor-not-allowed text-zinc-300/50'
              : defaultHighlight
              ? defaultActive && isActive
                ? 'bg-zinc-300/10 text-zinc-100'
                : 'text-zinc-300 md:hover:bg-zinc-300/5 md:hover:text-zinc-100'
              : ''
          } ${left && isExpanded ? 'justify-start' : 'justify-center'} ${
            classNames?.innerRoot
          }`}
        >
          {showIcon && (
            <div className="flex-none">
              {isActive
                ? activeIcon ?? inactiveIcon
                : inactiveIcon ?? activeIcon}
            </div>
          )}
          {showLabel && !showTooltip && (
            <>
              <div className="line-clamp-1 inline-block w-full text-sm">
                {label}
              </div>
              {trailingIcon}
            </>
          )}
        </div>
      </Tooltip>
    </Link>
  );
}
