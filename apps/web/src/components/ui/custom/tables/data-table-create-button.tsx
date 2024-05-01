'use client';

import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import { DialogContent, DialogTrigger } from '../../dialog';

export interface DataTableCreateButtonProps {
  editContent?: ReactNode;
}

export function DataTableCreateButton(props: DataTableCreateButtonProps) {
  const { t } = useTranslation('common');

  return (
    <>
      <DialogTrigger asChild>
        <Button size="sm" className="col-span-full ml-auto h-8 w-full md:w-fit">
          <Plus className="mr-2 h-4 w-4" />
          {t('create')}
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
