'use client';

import { ScrollArea } from '../../scroll-area';
import { DropdownMenuTrigger } from '@radix-ui/react-dropdown-menu';
import { MixerHorizontalIcon } from '@radix-ui/react-icons';
import { Button } from '@repo/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@repo/ui/components/ui/dropdown-menu';
import { Table } from '@tanstack/react-table';
import { UserCog } from 'lucide-react';
import { Translate } from 'next-translate';
import { Fragment } from 'react';

interface DataTableViewOptionsProps<TData> {
  viewOpionsText?: string;
  toggleColumnsText?: string;
  hideAllText?: string;
  showAllText?: string;
  table: Table<TData>;
  extraColumns?: any[];
  t: Translate;
}

export function DataTableViewOptions<TData>({
  t,
  viewOpionsText,
  toggleColumnsText,
  hideAllText,
  showAllText,
  table,
  extraColumns,
}: DataTableViewOptionsProps<TData>) {
  const isShowingAll = table
    .getAllColumns()
    .every((column) => column.getIsVisible());

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-8 w-full md:w-fit"
        >
          <MixerHorizontalIcon className="mr-2 h-4 w-4" />
          {viewOpionsText}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{toggleColumnsText}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-36">
          {table
            .getAllColumns()
            .filter(
              (column) =>
                typeof column.accessorFn !== 'undefined' && column.getCanHide()
            )
            .map((column, idx) => {
              return (
                <Fragment key={column.id}>
                  {/* If this item is the last system column before the extra
                  columns start (if there is any), add a separator */}
                  {extraColumns?.length &&
                  extraColumns[0].id === column.id &&
                  idx !== 0 ? (
                    <DropdownMenuSeparator key={`${column.id}-separator`} />
                  ) : null}

                  <DropdownMenuCheckboxItem
                    key={`${column.id}-checkbox`}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(value)}
                  >
                    {extraColumns?.some(
                      (extraColumn) => extraColumn.id === column.id
                    ) ? (
                      <UserCog className="mr-2 h-4 w-4" />
                    ) : undefined}

                    {/* @ts-expect-error */}
                    {extraColumns?.findLast(
                      (extraColumn: { id: string; name?: string }) =>
                        extraColumn.id === column.id
                    )?.name || t(column.id)}
                  </DropdownMenuCheckboxItem>
                </Fragment>
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
                .forEach((column) => column.toggleVisibility(!isShowingAll));
            }}
          >
            {isShowingAll ? hideAllText : showAllText}
          </Button>
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
