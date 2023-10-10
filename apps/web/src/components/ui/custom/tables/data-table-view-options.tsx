'use client';

import { DropdownMenuTrigger } from '@radix-ui/react-dropdown-menu';
import { MixerHorizontalIcon } from '@radix-ui/react-icons';
import { Table } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import useTranslation from 'next-translate/useTranslation';
import { ScrollArea } from '../../scroll-area';

interface DataTableViewOptionsProps<TData> {
  namespace: string;
  table: Table<TData>;
}

export function DataTableViewOptions<TData>({
  namespace,
  table,
}: DataTableViewOptionsProps<TData>) {
  const { t } = useTranslation(namespace);

  const isShowingAll = table
    .getAllColumns()
    .every((column) => column.getIsVisible());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-8 w-full md:w-fit"
        >
          <MixerHorizontalIcon className="mr-2 h-4 w-4" />
          {t('common:view-options')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t('common:toggle-columns')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-36">
          {table
            .getAllColumns()
            .filter(
              (column) =>
                typeof column.accessorFn !== 'undefined' && column.getCanHide()
            )
            .map((column) => {
              return (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {t(column.id)}
                </DropdownMenuCheckboxItem>
              );
            })}
        </ScrollArea>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>
          <Button
            className="w-full"
            size="sm"
            onClick={() => {
              table
                .getAllColumns()
                .forEach((column) =>
                  column.toggleVisibility(isShowingAll ? false : true)
                );
            }}
          >
            {isShowingAll ? t('common:hide-all') : t('common:show-all')}
          </Button>
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
