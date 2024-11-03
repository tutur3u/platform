'use client';

import { Button } from '../../button';
import { DialogContent, DialogTrigger } from '../../dialog';
import { Plus } from 'lucide-react';
import { ReactNode } from 'react';

export interface DataTableCreateButtonProps {
  newObjectTitle?: string;
  createButtonText?: string;
  editContent?: ReactNode;
}

export function DataTableCreateButton(props: DataTableCreateButtonProps) {
  return (
    <>
      <DialogTrigger asChild>
        <Button size="sm" className="col-span-full ml-auto h-8 w-full md:w-fit">
          <Plus className="h-4 w-4" />
          {props.newObjectTitle || props.createButtonText}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-[425px]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {props.editContent}
      </DialogContent>
    </>
  );
}
