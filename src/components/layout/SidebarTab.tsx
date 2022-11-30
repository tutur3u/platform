import { Tooltip } from '@mantine/core';
import Link from 'next/link';

interface SidebarTabProps {
  href: string;
  currentPath: string;
  label?: string;
  activeIcon: React.ReactNode;
  inactiveIcon?: React.ReactNode;
  showIcon?: boolean;
  showLabel?: boolean;
  showTooltip?: boolean;
  className?: string;
}

export default function SidebarTab({
  href,
  currentPath,
  label,
  activeIcon,
  inactiveIcon,
  showIcon = true,
  showLabel = true,
  showTooltip = false,
  className,
}: SidebarTabProps) {
  const isActive = currentPath === href;

  return (
    <Link
      href={href ?? '#'}
      className={`${className} w-full cursor-pointer px-2 text-lg font-semibold transition duration-300 ${
        isActive ? 'text-zinc-200' : 'text-zinc-200/50 hover:text-zinc-200'
      }`}
    >
      <Tooltip label={label} position="right" disabled={!showTooltip} withArrow>
        <div
          className={`flex items-center gap-2 ${
            showLabel && !showTooltip ? 'justify-start' : 'justify-center'
          }`}
        >
          {showIcon && (
            <div className="w-8 flex-none">
              {isActive ? activeIcon : inactiveIcon ?? activeIcon}
            </div>
          )}
          {showLabel && !showTooltip && (
            <div className="inline-block overflow-hidden">{label}</div>
          )}
        </div>
      </Tooltip>
    </Link>
  );
}
