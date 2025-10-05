'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@tuturuuu/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { ArrowDownCircle, ArrowUpCircle, Check, Filter, X } from 'lucide-react';
import { useState } from 'react';

interface TypeFilterProps {
  selectedType?: string;
  onTypeChange: (type: string | undefined) => void;
  className?: string;
}

const typeOptions = [
  {
    value: 'income',
    label: 'Income',
    icon: ArrowUpCircle,
    color: 'text-dynamic-green',
  },
  {
    value: 'expense',
    label: 'Expense',
    icon: ArrowDownCircle,
    color: 'text-dynamic-red',
  },
];

export function TypeFilter({
  selectedType,
  onTypeChange,
  className,
}: TypeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasActiveFilter = !!selectedType;

  const selectedOption = typeOptions.find(
    (option) => option.value === selectedType
  );

  const handleTypeToggle = (type: string) => {
    if (selectedType === type) {
      onTypeChange(undefined);
    } else {
      onTypeChange(type);
    }
  };

  const clearFilter = () => {
    onTypeChange(undefined);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Filter className="h-3 w-3" />
            <span className="text-xs">
              {selectedOption ? selectedOption.label : 'Filter by type'}
            </span>
            {hasActiveFilter && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 rounded-full px-1.5 text-xs"
              >
                1
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start">
          <Command>
            <CommandList>
              <CommandEmpty>No type found.</CommandEmpty>

              <CommandGroup>
                {typeOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = selectedType === option.value;

                  return (
                    <CommandItem
                      key={option.value}
                      onSelect={() => handleTypeToggle(option.value)}
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <div
                        className={cn(
                          'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'opacity-50 [&_svg]:invisible'
                        )}
                      >
                        <Check className="h-4 w-4" />
                      </div>
                      <Icon className={cn('h-4 w-4', option.color)} />
                      <span className="flex-1 font-medium text-sm">
                        {option.label}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>

              {hasActiveFilter && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={clearFilter}
                      className="cursor-pointer justify-center text-center text-destructive"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Clear filter
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
