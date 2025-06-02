import { DEV_MODE } from '@/constants/common';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import React from 'react';

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
  classNames?: {
    root?: string;
  };
  disabled?: boolean;
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
  classNames,
  disabled = false,
}: SidebarButtonProps) {
  if (disabled && !DEV_MODE) return null;

  const buttonContent = (
    <div
      onClick={disabled ? undefined : onClick}
      className={`flex select-none items-center gap-2 rounded p-2 ${
        left ? 'justify-start' : 'justify-center'
      } ${
        disabled
          ? 'cursor-not-allowed text-zinc-600'
          : isActive
            ? 'border-border cursor-pointer bg-zinc-500/10 text-zinc-900 dark:border-zinc-300/10 dark:bg-zinc-500/10 dark:text-zinc-100'
            : 'cursor-pointer border-transparent text-zinc-700 md:hover:bg-zinc-500/10 md:hover:text-zinc-900 dark:text-zinc-300 md:dark:hover:bg-zinc-300/5 md:dark:hover:text-zinc-100'
      } ${classNames?.root}`}
    >
      {showIcon && <div className="flex-none">{activeIcon}</div>}
      {showLabel && (
        <div className="line-clamp-1 text-sm font-semibold">{label}</div>
      )}
    </div>
  );

  if (!showTooltip) {
    return buttonContent;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={16}>
        <div className="font-semibold">{label}</div>
      </TooltipContent>
    </Tooltip>
  );
}
