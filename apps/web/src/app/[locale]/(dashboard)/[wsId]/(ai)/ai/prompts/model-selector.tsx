import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { FormControl, FormLabel } from '@tuturuuu/ui/form';
import { CheckIcon, ChevronsUpDown } from '@tuturuuu/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';

export default function AIModelSelector({
  open,
  value,
  label,
  placeholder,
  searchPlaceholder,
  emptyDataMessage,
  fetchUrl,
  disabled,
  onOpenChange,
  onValueChange,
  beforeFetch,
  afterFetch,
}: {
  open: boolean;
  value: string;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyDataMessage?: string;
  fetchUrl: string;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onValueChange: (value: string) => void;
  beforeFetch?: () => void;
  afterFetch?: (data: any) => void;
}) {
  const { data, error } = useSWR<any[]>(fetchUrl, async (url: string) => {
    if (beforeFetch) beforeFetch();
    const data = await fetcher(url);
    if (afterFetch) afterFetch(data);
    return data;
  });

  const loading = !data && !error;

  return (
    <div className="grid">
      <FormLabel className="pb-2">{label || 'Selector'}</FormLabel>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <FormControl>
            <Button
              variant="outline"
              role="combobox"
              className={cn(
                'justify-between',
                !value && 'text-muted-foreground'
              )}
              disabled={disabled || loading}
            >
              {value
                ? data?.find((c) => c.id === value)?.name
                : loading
                  ? 'Fetching...'
                  : placeholder || 'Select an item'}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </FormControl>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0">
          <Command>
            <CommandInput
              placeholder={searchPlaceholder || 'Search'}
              disabled={disabled || loading}
            />
            <CommandEmpty>{emptyDataMessage || 'No data found.'}</CommandEmpty>
            <CommandList>
              <CommandGroup>
                {(data?.length || 0) > 0
                  ? data?.map((row) => (
                      <CommandItem
                        key={row.id}
                        value={row.name}
                        onSelect={() => {
                          onValueChange(row?.id || '');
                          onOpenChange(false);
                        }}
                      >
                        <CheckIcon
                          className={cn(
                            'mr-2 h-4 w-4',
                            row.id === value ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        {row.name}
                      </CommandItem>
                    ))
                  : null}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
