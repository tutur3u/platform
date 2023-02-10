import { Tooltip } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAppearance } from '../../hooks/useAppearance';

interface SidebarLinkProps {
  href?: string;
  onClick?: () => void;
  label?: string;
  activeIcon?: React.ReactNode;
  inactiveIcon?: React.ReactNode;
  showIcon?: boolean;
  showLabel?: boolean;
  showTooltip?: boolean;
  enableOffset?: boolean;
  defaultActive?: boolean;
  defaultHighlight?: boolean;
  left?: boolean;
  className?: string;
}

export default function SidebarLink({
  href,
  onClick,
  label,
  activeIcon,
  inactiveIcon,
  showIcon = true,
  showLabel = true,
  showTooltip = false,
  defaultActive = true,
  defaultHighlight = true,
  left = false,
  className,
}: SidebarLinkProps) {
  const router = useRouter();
  const { projectId } = router.query;

  const { leftSidebarPref, changeLeftSidebarMainPref } = useAppearance();

  const isExpanded = leftSidebarPref.main === 'open';
  const isActive = href
    ? href != '/'
      ? router.pathname
          .replace('/[projectId]', `/${projectId}`)
          .startsWith(href)
      : router.pathname === href
    : false;

  return (
    <Link
      href={href || '#'}
      onClick={() => {
        if (onClick) onClick();
        if (window && window.innerWidth <= 768)
          changeLeftSidebarMainPref('closed');
      }}
      className="font-semibold"
    >
      <Tooltip
        label={label}
        position="right"
        offset={16}
        disabled={!showTooltip}
      >
        <div
          className={`flex items-center gap-2 rounded ${
            defaultHighlight
              ? defaultActive && isActive
                ? 'bg-zinc-300/10 p-2 text-zinc-100'
                : 'p-2 text-zinc-300 hover:bg-zinc-300/5 hover:text-zinc-100'
              : ''
          } ${
            left || isExpanded ? 'justify-start' : 'justify-center'
          } ${className}`}
        >
          {showIcon && (
            <div className="flex-none">
              {isActive
                ? activeIcon ?? inactiveIcon
                : inactiveIcon ?? activeIcon}
            </div>
          )}
          {showLabel && !showTooltip && (
            <div className="line-clamp-1 inline-block text-sm">{label}</div>
          )}
        </div>
      </Tooltip>
    </Link>
  );
}
