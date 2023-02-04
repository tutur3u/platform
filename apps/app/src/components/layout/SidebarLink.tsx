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
  left = false,
  className,
}: SidebarLinkProps) {
  const router = useRouter();
  const { orgId } = router.query;

  const { leftSidebarPref } = useAppearance();

  const isExpanded = leftSidebarPref.main === 'open';
  const isActive = router.pathname.replace('/[orgId]', `/${orgId}`) === href;

  return (
    <Link href={href || '#'} onClick={onClick} className="w-full font-semibold">
      <Tooltip
        label={label}
        position="right"
        offset={4}
        disabled={!showTooltip}
      >
        <div
          className={`flex items-center gap-2 rounded p-2 ${
            defaultActive && isActive
              ? 'bg-zinc-300/10 text-zinc-300'
              : 'text-zinc-300 hover:bg-zinc-300/10 hover:text-zinc-200'
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
            <div className="line-clamp-1 inline-block">{label}</div>
          )}
        </div>
      </Tooltip>
    </Link>
  );
}
