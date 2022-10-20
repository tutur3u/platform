import Link from 'next/link';
import { useSidebar } from '../../hooks/useSidebar';

interface SidebarProps {
  href: string;
  currentPath: string;
  label: string;
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
}: SidebarProps) {
  const isActive = currentPath === href;

  const { isCollapsed } = useSidebar();

  const extraCss = isActive
    ? 'text-zinc-200'
    : 'text-zinc-400/50 hover:text-zinc-300';

  return (
    <Link href={href}>
      <div
        className={`${extraCss} ${
          isCollapsed ? 'w-full' : 'w-full'
        } text-lg m-1 p-2 font-semibold rounded-md hover:cursor-pointer transition duration-300`}
      >
        <div className="flex justify-start items-center gap-2">
          {showIcon && <div className="w-5 flex-none">{icon}</div>}
          {showLabel && (
            <div className="inline-block overflow-hidden">{label}</div>
          )}
        </div>
      </div>
    </Link>
  );
}
