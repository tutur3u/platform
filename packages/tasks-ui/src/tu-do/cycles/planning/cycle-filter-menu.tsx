'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { Fragment, type ReactNode } from 'react';

export interface CycleFilterOption {
  id: string;
  label: string;
}

export interface CycleFilterSection {
  key: string;
  label?: string;
  options: CycleFilterOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

function toggle(ids: string[], id: string, checked: boolean) {
  return checked ? [...ids, id] : ids.filter((value) => value !== id);
}

/** A compact multi-select dropdown; sections share one menu. */
export function CycleFilterMenu({
  label,
  icon,
  sections,
}: {
  label: string;
  icon?: ReactNode;
  sections: CycleFilterSection[];
}) {
  const count = new Set(sections.flatMap((section) => section.selected)).size;
  const visible = sections.filter((section) => section.options.length > 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-8 gap-1.5 px-2', count > 0 && 'bg-muted')}
        >
          {icon}
          {label}
          {count > 0 && (
            <span className="text-muted-foreground tabular-nums">{count}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56">
        {visible.map((section, index) => (
          <Fragment key={section.key}>
            {index > 0 && <DropdownMenuSeparator />}
            {section.label && (
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                {section.label}
              </DropdownMenuLabel>
            )}
            {section.options.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.id}
                checked={section.selected.includes(option.id)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) =>
                  section.onChange(
                    toggle(section.selected, option.id, checked === true)
                  )
                }
              >
                <span className="truncate">{option.label}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
