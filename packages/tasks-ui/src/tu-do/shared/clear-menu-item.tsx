import { X } from '@tuturuuu/icons';

interface ClearMenuItemProps {
  label: string;
  onClick: () => void;
}

/**
 * ClearMenuItem component displays a destructive action to clear/remove a value.
 * Features consistent red styling for clear actions across popovers.
 *
 * @example
 * ```tsx
 * <ClearMenuItem
 *   label="Clear priority"
 *   onClick={() => updatePriority(null)}
 * />
 * ```
 */
export function ClearMenuItem({ label, onClick }: ClearMenuItemProps) {
  return (
    <>
      <div className="my-1 border-t" />
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-dynamic-red/80 text-sm transition-colors hover:bg-dynamic-red/10 hover:text-dynamic-red"
      >
        <X className="h-4 w-4" />
        {label}
      </button>
    </>
  );
}
