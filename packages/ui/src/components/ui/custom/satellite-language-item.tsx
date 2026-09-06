'use client';
import { Check, Hexagon, Monitor } from '@tuturuuu/icons';
import { DropdownMenuItem } from '../dropdown-menu';
export function SatelliteLanguageItem({
  label,
  selected,
  system = false,
  onSelect,
}: {
  label: string;
  selected?: boolean;
  system?: boolean;
  onSelect: () => void | Promise<void>;
}) {
  const Icon = selected ? Check : system ? Monitor : Hexagon;
  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onClick={onSelect}
      disabled={selected}
    >
      <Icon className={system ? 'h-4 w-4' : 'h-4 w-4 text-dynamic-indigo'} />
      {label}
    </DropdownMenuItem>
  );
}
