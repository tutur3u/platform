import { Tooltip } from '@mantine/core';
import Link from 'next/link';
import { useSidebar } from '../../hooks/useSidebar';

interface NavbarTabProps {
  href: string;
  currentPath: string;
  label?: string;
  icon: React.ReactNode;
  showIcon?: boolean;
  showLabel?: boolean;
  showTooltip?: boolean;
}

export default function NavbarTab({
  href,
  currentPath,
  label,
  icon,
}: NavbarTabProps) {
  const isActive = currentPath === href;

  const { isCollapsed } = useSidebar();

  const extraCss = isActive
    ? 'text-zinc-200'
    : 'text-zinc-400/50 hover:text-zinc-300';

  return (
    <Link href={href ?? '#'}>
      <Tooltip
        label={label}
        color="gray"
        position="right"
        withArrow
        offset={10}
        disabled={!isCollapsed}
        className="z-40"
      >
        <div
          className={`${extraCss} ${
            isCollapsed ? 'w-fit' : 'w-full'
          } hover:border-zinc-600 text-lg p-2 font-semibold rounded-full hover:cursor-pointer transition duration-300`}
        >
          <div className="flex justify-start items-center gap-2">
            <div className="w-8 h-8 inline-block">{icon}</div>
            {/* {isCollapsed || <div className="inline-block">{label}</div>} */}
          </div>
        </div>
      </Tooltip>
    </Link>
  );
}
