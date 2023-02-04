import { Tooltip } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAppearance } from '../../hooks/useAppearance';

interface SidebarButtonProps {
  href?: string;
  onClick?: () => void;
  label?: string;
  activeIcon?: React.ReactNode;
  inactiveIcon?: React.ReactNode;
  showIcon?: boolean;
  showLabel?: boolean;
  showTooltip?: boolean;
  enableOffset?: boolean;
  left?: boolean;
  className?: string;
}

export default function SidebarButton({
  onClick,
  label,
  activeIcon,
  inactiveIcon,
  showIcon = true,
  showLabel = true,
  showTooltip = false,
  left = false,
  className,
}: SidebarButtonProps) {
  const router = useRouter();
  const { orgId } = router.query;

  const { leftSidebarPref } = useAppearance();

  const isExpanded = leftSidebarPref.main === 'open';

  return (
    <button onClick={onClick} className="w-full font-semibold">
      <Tooltip
        label={label}
        position="right"
        offset={4}
        disabled={!showTooltip}
      >
        <div
          className={`flex items-center gap-2 rounded p-2 text-zinc-300 hover:bg-zinc-300/10 hover:text-zinc-200 ${
            left || isExpanded ? 'justify-start' : 'justify-center'
          } ${className}`}
        >
          {showIcon && (
            <div className="flex-none">{activeIcon ?? inactiveIcon}</div>
          )}
          {showLabel && !showTooltip && (
            <div className="line-clamp-1 inline-block">{label}</div>
          )}
        </div>
      </Tooltip>
    </button>
  );
}
