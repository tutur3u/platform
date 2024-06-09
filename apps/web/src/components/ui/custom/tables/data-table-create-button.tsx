'use client';

import { DialogContent, DialogTrigger } from '../../dialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import { ReactNode } from 'react';

export interface DataTableCreateButtonProps {
  newObjectTitle?: string;
  editContent?: ReactNode;
}

export function DataTableCreateButton(props: DataTableCreateButtonProps) {
  const { t } = useTranslation('common');

  return (
    <>
      <DialogTrigger asChild>
        <Button size="sm" className="col-span-full ml-auto h-8 w-full md:w-fit">
          <Plus className="mr-2 h-4 w-4" />
          {props.newObjectTitle || t('create')}
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
