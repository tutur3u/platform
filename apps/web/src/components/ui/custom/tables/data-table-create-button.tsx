'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';

export interface DataTableCreateButtonProps {
  onClick: () => void;
}

export function DataTableCreateButton(props: DataTableCreateButtonProps) {
  const { t } = useTranslation('common');

  return (
    <Button
      size="sm"
      className="col-span-full ml-auto h-8 w-full md:w-fit"
      onClick={props.onClick}
    >
      <Plus className="mr-2 h-4 w-4" />
      {t('create')}
    </Button>
  );
}
