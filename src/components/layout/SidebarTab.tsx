import { Tooltip } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';

interface SidebarTabProps {
  href?: string;
  onClick?: () => void;
  label?: string;
  activeIcon?: React.ReactNode;
  inactiveIcon?: React.ReactNode;
  showIcon?: boolean;
  showLabel?: boolean;
  showTooltip?: boolean;
  enableOffset?: boolean;
  className?: string;
}

export default function SidebarTab({
  href,
  onClick,
  label,
  activeIcon,
  inactiveIcon,
  showIcon = true,
  showLabel = true,
  showTooltip = false,
  enableOffset = false,
  className,
}: SidebarTabProps) {
  const router = useRouter();
  const isActive = router.pathname === href;

  return (
    <Link
      href={onClick ? '' : href || '#'}
      onClick={(e) => {
        if (onClick) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`w-full cursor-pointer text-lg font-semibold transition duration-300 ${
        isActive ? 'text-zinc-200' : 'text-zinc-200/50 hover:text-zinc-200'
      }`}
    >
      <Tooltip
        label={label}
        position="right"
        offset={20}
        disabled={!showTooltip}
        withArrow
      >
        <div
          className={`flex items-center gap-2 ${
            showTooltip
              ? 'justify-center'
              : `justify-start ${enableOffset ? 'translate-x-[-0.265rem]' : ''}`
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
            <div className="inline-block line-clamp-1">{label}</div>
          )}
        </div>
      </Tooltip>
    </Link>
  );
}
