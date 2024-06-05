'use client';

import { CheckIcon } from '@radix-ui/react-icons';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { ComponentType, ReactNode, useEffect, useMemo, useState } from 'react';
import useQuery from '@/hooks/useQuery';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, CheckCheck, Trash, Undo } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/navigation';

interface UserDatabaseFilterProps {
  tag: string;
  icon?: ReactNode;
  title: string;
  options: {
    label: string;
    value: string;
    count?: number;
    icon?: ComponentType<{ className?: string }>;
  }[];
  href?: string;
  resetSignals?: string[];
  defaultValues?: string[];
  extraQueryOnSet?: Record<string, undefined | string | string[]>;
  sortCheckedFirst?: boolean;
  multiple?: boolean;
  disabled?: boolean;
}

export function UserDatabaseFilter({
  tag,
  icon,
  title,
  options,
  href,
  // resetSignals,
  defaultValues,
  extraQueryOnSet,
  sortCheckedFirst = true,
  multiple = true,
  disabled,
}: UserDatabaseFilterProps) {
  const { t } = useTranslation('user-data-table');

  const router = useRouter();
  const query = useQuery();

  const oldValues: Set<string> = useMemo(
    () =>
      defaultValues !== undefined
        ? !multiple
          ? new Set(defaultValues.slice(0, 1))
          : new Set(defaultValues)
        : !multiple && Array.isArray(query.get(tag))
          ? new Set(query.get(tag)?.slice(0, 1) as string)
          : new Set(
              Array.isArray(query.get(tag))
                ? (query.get(tag) as string[])
                : [query.get(tag) as string]
            ),
    [defaultValues, multiple, query, tag]
  );

  const [selectedValues, setSelectedValues] = useState(oldValues);
  const selectedSize = selectedValues.size;

  const hasChanges = useMemo(
    () =>
      Array.from(selectedValues).some((value) => !oldValues.has(value)) ||
      Array.from(oldValues).some((value) => !selectedValues.has(value)) ||
      oldValues.size !== selectedValues.size,
    [oldValues, selectedValues]
  );

  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (applying && !hasChanges) {
      setApplying(false);
      setOpen(false);
    }
  }, [applying, hasChanges]);

  const sortedOptions = useMemo(() => {
    if (!sortCheckedFirst) return options;

    const selected = options.filter((option) => oldValues.has(option.value));
    const unselected = options.filter((option) => !oldValues.has(option.value));
    return selected.concat(unselected);
  }, [sortCheckedFirst, options, oldValues]);

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setSelectedValues(oldValues);
        }

        setOpen(isOpen);
      }}
    >
      <PopoverTrigger disabled={disabled} asChild>
        <Button
          variant="outline"
          className="h-8 border-dashed px-1"
          disabled={disabled}
        >
          {icon}
          {title}
          {selectedSize > 0 &&
            options
              .map((option) => option.value)
              .some((value) => selectedValues.has(value)) && (
              <>
                <Separator orientation="vertical" className="mx-1 h-4" />
                <Badge
                  variant="secondary"
                  className="rounded-sm px-1 font-normal lg:hidden"
                >
                  {selectedSize}
                </Badge>
                <div className="hidden space-x-1 lg:flex">
                  {multiple && selectedSize > 2 ? (
                    <Badge
                      variant="secondary"
                      className="rounded-sm px-1 font-normal"
                    >
                      {selectedSize} {t('selected')}
                    </Badge>
                  ) : (
                    options
                      .filter((option) => selectedValues.has(option.value))
                      .slice(0, multiple ? 2 : 1)
                      .map((option) => (
                        <Badge
                          variant="secondary"
                          key={option.value}
                          className="rounded-sm px-1 font-normal"
                        >
                          {option.label}
                        </Badge>
                      ))
                  )}
                </div>
              </>
            )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(calc(100vw-1rem),24rem)] p-0"
        align="center"
      >
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <ScrollArea className="h-32 md:h-64">
              <CommandGroup>
                {sortedOptions.map((option) => {
                  const isSelected = selectedValues.has(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      onSelect={() => {
                        if (!multiple) selectedValues.clear();

                        if (isSelected && multiple) {
                          selectedValues.delete(option.value);
                        } else {
                          selectedValues.add(option.value);
                        }

                        setSelectedValues(new Set(selectedValues));
                      }}
                      disabled={applying}
                    >
                      <div
                        className={cn(
                          'border-primary mr-2 flex h-4 w-4 items-center justify-center border',
                          multiple ? 'rounded-sm' : 'rounded-full',
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'opacity-50 [&_svg]:invisible'
                        )}
                      >
                        <CheckIcon className={cn('h-4 w-4')} />
                      </div>
                      {option.icon && (
                        <option.icon className="text-muted-foreground mr-2 h-4 w-4" />
                      )}
                      <span>{option.label}</span>
                      {option.count !== undefined && (
                        <span className="ml-auto flex h-4 w-4 items-center justify-center font-mono text-xs">
                          {option.count}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </ScrollArea>

            <CommandSeparator />
            <CommandGroup>
              <div className="flex items-center gap-1">
                <CommandItem
                  onSelect={() =>
                    selectedSize === 0 && multiple
                      ? setSelectedValues(
                          new Set(options.map((option) => option.value))
                        )
                      : hasChanges
                        ? setSelectedValues(oldValues)
                        : setSelectedValues(new Set())
                  }
                  className="w-full justify-center text-center"
                  disabled={
                    applying ||
                    (!multiple && oldValues.size === 0 && selectedSize === 0)
                  }
                >
                  {selectedSize === 0 && multiple ? (
                    <>
                      <CheckCheck className="mr-2 h-4 w-4" />
                      <span className="line-clamp-1">{t('select_all')}</span>
                    </>
                  ) : hasChanges && oldValues.size > 0 ? (
                    <>
                      <Undo className="mr-2 h-4 w-4" />
                      <span className="line-clamp-1">
                        {t('revert_changes')}
                      </span>
                    </>
                  ) : (
                    <>
                      <Trash className="mr-2 h-4 w-4" />
                      <span className="line-clamp-1">
                        {t('clear_selection')}
                      </span>
                    </>
                  )}
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setApplying(true);
                    if (!multiple && href)
                      router.push(`${href}/${Array.from(selectedValues)[0]}`);
                    else {
                      if (extraQueryOnSet) query.set(extraQueryOnSet, false);
                      query.set({
                        [tag]: Array.from(selectedValues),
                      });
                    }
                  }}
                  className="w-full justify-center text-center"
                  disabled={!hasChanges || applying}
                >
                  <Check className="mr-2 h-4 w-4" />
                  <span className="line-clamp-1">
                    {applying ? t('applying') : t('apply_changes')}
                  </span>
                </CommandItem>
              </div>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
