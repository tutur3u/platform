import { Tooltip } from '@mantine/core';
import Link from 'next/link';
import { useSidebar } from '../../hooks/useSidebar';

interface SidebarProps {
  href: string;
  currentPath: string;
  label: string;
  icon: React.ReactNode;
}

export default function SidebarTab({
  href,
  currentPath,
  label,
  icon,
}: SidebarProps) {
  const isActive = currentPath === href;

  const { isCollapsed } = useSidebar();

  const extraCss = isActive
    ? 'bg-zinc-300/10 text-zinc-300 hover:bg-zinc-300/20 hover:text-zinc-200'
    : 'hover:bg-zinc-300/10 hover:text-zinc-300';

  return (
    <Link href={href ?? '#'}>
      <Tooltip
        label={label}
        color="gray"
        position="right"
        withArrow
        offset={10}
        disabled={!isCollapsed}
      >
        <div
          className={`${extraCss} ${
            isCollapsed ? 'w-fit' : 'w-full'
          } border border-zinc-700 hover:border-zinc-600 text-lg m-1 p-2 font-semibold rounded-md hover:cursor-pointer transition duration-300`}
        >
          <div className="flex justify-start items-center gap-2">
            <div className="w-6 h-6 inline-block">{icon}</div>
            {isCollapsed || <div className="inline-block">{label}</div>}
          </div>
        </div>
      </Tooltip>
    </Link>
  );
}
