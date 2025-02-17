'use client';

import useSearchParams from '@/hooks/useSearchParams';
import { Badge } from '@tutur3u/ui/badge';
import { Button } from '@tutur3u/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@tutur3u/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@tutur3u/ui/popover';
import { ScrollArea } from '@tutur3u/ui/scroll-area';
import { Separator } from '@tutur3u/ui/separator';
import { cn } from '@tutur3u/utils/format';
import { Check, CheckCheck, Trash, Undo } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';

interface FilterProps {
  tag?: string;
  icon?: ReactNode;
  title: string;
  options: {
    label: string;
    description?: string;
    value: string;
    count?: number;
    icon?: ReactNode;
    checked?: boolean;
    disabled?: boolean;
  }[];
  href?: string;
  align?: 'start' | 'center' | 'end';
  resetSignals?: string[];
  defaultValues?: string[];
  alwaysShowNumber?: boolean;
  alwaysEnableZero?: boolean;
  extraQueryOnSet?: Record<string, undefined | string | string[]>;
  sortCheckedFirst?: boolean;
  multiple?: boolean;
  disabled?: boolean;
  variant?:
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link'
    | 'destructive'
    | null
    | undefined;
  className?: string;
  contentClassName?: string;
  hideSelected?: boolean;
  // eslint-disable-next-line no-unused-vars
  onSet?: (values: string[]) => Promise<void> | void;
}

export function Filter({
  tag,
  icon,
  title,
  options,
  href,
  align,
  // resetSignals,
  defaultValues,
  alwaysShowNumber = false,
  alwaysEnableZero = false,
  extraQueryOnSet,
  sortCheckedFirst = true,
  multiple = true,
  disabled,
  variant,
  className,
  contentClassName,
  hideSelected = false,
  onSet,
}: FilterProps) {
  const t = useTranslations('user-data-table');

  const searchParams = useSearchParams();
  const router = useRouter();

  const oldValues: Set<string> = useMemo(
    () =>
      defaultValues !== undefined
        ? !multiple
          ? new Set(defaultValues.slice(0, 1))
          : new Set(defaultValues)
        : tag
          ? !multiple && Array.isArray(searchParams.get(tag))
            ? new Set(searchParams.get(tag)?.slice(0, 1) as string)
            : new Set(
                Array.isArray(searchParams.get(tag))
                  ? (searchParams.get(tag) as string[])
                  : [searchParams.get(tag) as string]
              )
          : new Set(),
    [searchParams, defaultValues, multiple, tag]
  );

  const [searchQuery, setSearchQuery] = useState('' as string);
  const [selectedValues, setSelectedValues] = useState(oldValues);
  const selectedSize = selectedValues.size;

  useEffect(() => {
    if (searchParams.isEmpty) setSelectedValues(new Set(defaultValues || []));
  }, [searchParams.isEmpty, defaultValues]);

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
      setSearchQuery('');
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

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const isMobile = window && window.innerWidth <= 640;
    setIsMobile(isMobile);
  }, []);

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setSearchQuery('');
          setSelectedValues(oldValues);
        }

        setOpen(isOpen);
      }}
      modal={true}
    >
      <PopoverTrigger disabled={disabled} asChild>
        <Button
          variant={
            variant
              ? 'outline'
              : !hideSelected &&
                  selectedSize > 0 &&
                  options
                    .map((option) => option.value)
                    .some((value) => selectedValues.has(value))
                ? undefined
                : 'outline'
          }
          className={cn('h-8 border-dashed px-1', className)}
          disabled={disabled}
        >
          {icon}
          {title}
          {!hideSelected &&
            selectedSize > 0 &&
            options
              .map((option) => option.value)
              .some((value) => selectedValues.has(value)) && (
              <>
                <Separator orientation="vertical" className="mx-1 h-4" />
                <Badge
                  variant="secondary"
                  className="rounded-sm bg-background/80 px-1 font-normal text-foreground hover:bg-background/80 lg:hidden"
                >
                  {selectedSize}
                </Badge>
                <div className="hidden space-x-1 lg:flex">
                  {(multiple && selectedSize > 2) || alwaysShowNumber ? (
                    <Badge
                      variant="secondary"
                      className="rounded-sm bg-background/80 px-1 font-normal text-foreground hover:bg-background/80"
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
                          className="rounded-sm bg-background/80 px-1 font-normal text-foreground hover:bg-background/80"
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
        className={cn('w-[min(calc(100vw-1rem),24rem)] p-0', contentClassName)}
        align={isMobile ? 'center' : (align ?? 'start')}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={title}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <ScrollArea className="h-32 md:h-64">
              <CommandGroup>
                {sortedOptions
                  .filter((option) =>
                    option.label
                      .toLowerCase()
                      .includes(searchQuery.toLowerCase())
                  )
                  .map((option) => {
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
                        disabled={
                          applying ||
                          (!alwaysEnableZero && option.count === 0) ||
                          option.disabled
                        }
                        className="gap-2"
                      >
                        <div
                          className={cn(
                            'flex h-4 w-4 items-center justify-center border border-primary',
                            multiple ? 'rounded-sm' : 'rounded-full',
                            isSelected || option.checked
                              ? 'bg-primary text-primary-foreground'
                              : 'opacity-50 [&_svg]:invisible'
                          )}
                        >
                          <Check className={cn('h-4 w-4')} />
                        </div>
                        {option.icon}
                        <div>
                          <span>{option.label}</span>
                          <div className="opacity-50">{option.description}</div>
                        </div>
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

            <CommandSeparator alwaysRender />
            <CommandGroup>
              <div className="grid items-center gap-1 md:flex">
                <CommandItem
                  onSelect={() => {
                    if (selectedSize === 0 && multiple)
                      return setSelectedValues(
                        new Set(options.map((option) => option.value))
                      );

                    if (hasChanges) return setSelectedValues(oldValues);

                    setSelectedValues(new Set());
                    setSearchQuery('');
                  }}
                  className="w-full justify-center text-center"
                  disabled={
                    applying ||
                    (!multiple && oldValues.size === 0 && selectedSize === 0) ||
                    options.every((option) => option.checked && option.disabled)
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
                <CommandSeparator className="md:hidden" alwaysRender />
                <CommandItem
                  onSelect={async () => {
                    setApplying(true);

                    if (onSet) {
                      await onSet(Array.from(selectedValues));
                      setSelectedValues(new Set());
                      setApplying(false);
                      setOpen(false);
                      return;
                    }

                    if (!multiple && href)
                      router.push(`${href}/${Array.from(selectedValues)[0]}`);
                    else if (tag) {
                      if (extraQueryOnSet)
                        searchParams.set(extraQueryOnSet, false);
                      searchParams.set({
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
