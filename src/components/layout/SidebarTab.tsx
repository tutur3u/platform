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
}

export default function SidebarTab({
  href,
  currentPath,
  label,
  icon,
  showIcon = true,
  showLabel = true,
  showTooltip = false,
}: SidebarTabProps) {
  const isActive = currentPath === href;

  const extraCss = isActive
    ? 'text-zinc-200'
    : 'text-zinc-200/50 hover:text-zinc-200';

  return (
    <Link href={href ?? '#'}>
      <Tooltip label={label} position="right" disabled={!showTooltip}>
        <a
          className={`${extraCss} w-full text-lg px-2 font-semibold transition duration-300 cursor-pointer`}
        >
          <div className="flex justify-start items-center gap-2">
            {showIcon && <div className="w-8 flex-none">{icon}</div>}
            {showLabel && (
              <div className="inline-block overflow-hidden">{label}</div>
            )}
          </div>
        </a>
      </Tooltip>
    </Link>
  );
}
