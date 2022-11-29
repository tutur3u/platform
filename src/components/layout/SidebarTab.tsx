import { Tooltip } from '@mantine/core';
import Link from 'next/link';

interface SidebarTabProps {
  href: string;
  currentPath: string;
  label?: string;
  icon: React.ReactNode;
  showIcon?: boolean;
  showLabel?: boolean;
  showTooltip?: boolean;
  className?: string;
}

export default function SidebarTab({
  href,
  currentPath,
  label,
  icon,
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
      <Tooltip label={label} position="right" disabled={!showTooltip}>
        <div className="flex items-center justify-start gap-2">
          {showIcon && <div className="w-8 flex-none">{icon}</div>}
          {showLabel && (
            <div className="inline-block overflow-hidden">{label}</div>
          )}
        </div>
      </Tooltip>
    </Link>
  );
}
