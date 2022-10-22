import Link from 'next/link';
interface SidebarTabProps {
  href: string;
  currentPath: string;
  label?: string;
  icon: React.ReactNode;
  showIcon?: boolean;
  showLabel?: boolean;
}

export default function SidebarTab({
  href,
  currentPath,
  label,
  icon,
  showIcon = true,
  showLabel = true,
}: SidebarTabProps) {
  const isActive = currentPath === href;

  const extraCss = isActive
    ? 'text-zinc-200'
    : 'text-zinc-400/50 hover:text-zinc-300';

  return (
    <Link href={href ?? '#'}>
      <div
        className={`${extraCss} hover:border-zinc-600 text-lg p-2 font-semibold rounded-full hover:cursor-pointer transition duration-300`}
      >
        <div className="flex justify-start items-center gap-[1.05rem]">
          {showIcon && <div className="w-9 flex-none">{icon}</div>}
          {showLabel && (
            <div className="inline-block overflow-hidden">{label}</div>
          )}
        </div>
      </div>
    </Link>
  );
}
