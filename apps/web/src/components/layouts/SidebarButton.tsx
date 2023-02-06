import { Tooltip } from '@mantine/core';
import { useAppearance } from '../../hooks/useAppearance';

interface SidebarButtonProps {
  onClick?: () => void;
  label?: string;
  activeIcon?: React.ReactNode;
  isActive?: boolean;
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
  isActive = false,
  showIcon = true,
  showLabel = true,
  showTooltip = false,
  left = false,
  className,
}: SidebarButtonProps) {
  const { leftSidebarPref } = useAppearance();

  const isExpanded = leftSidebarPref.main === 'open';

  return (
    <Tooltip
      label={<div className="font-semibold">{label}</div>}
      position="right"
      offset={16}
      disabled={!showTooltip}
    >
      <button
        onClick={onClick}
        className={`flex items-center gap-2 rounded p-2 font-semibold text-zinc-400 hover:bg-zinc-300/10 hover:text-zinc-200 ${
          left || isExpanded ? 'justify-start' : 'justify-center'
        } ${isActive && 'bg-zinc-300/10 text-zinc-200'} ${className}`}
      >
        {showIcon && <div className="flex-none">{activeIcon}</div>}
        {showLabel && (
          <div className="line-clamp-1 inline-block text-sm">{label}</div>
        )}
      </button>
    </Tooltip>
  );
}
