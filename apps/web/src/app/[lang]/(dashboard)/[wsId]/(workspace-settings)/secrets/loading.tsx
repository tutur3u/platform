import useTranslation from 'next-translate/useTranslation';
import { Separator } from '@/components/ui/separator';
import { secretColumns } from '@/data/columns/secrets';
import SecretEditDialog from './_components/secret-edit-dialog';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/custom/tables/data-table';

export default function Loading() {
  const { t } = useTranslation('ws-secrets');

  return (
    <>
      <div className="border-border bg-foreground/5 flex flex-col justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold">{t('secrets')}</h1>
          <p className="text-zinc-700 dark:text-zinc-400">{t('description')}</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
          <SecretEditDialog
            data={{}}
            trigger={
              <Button disabled>
                <Plus className="mr-2 h-5 w-5" />
                {t('create_secret')}
              </Button>
            }
          />
        </div>
      </div>
      <Separator className="my-4" />
      <DataTable
        columnGenerator={secretColumns}
        namespace="secret-data-table"
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
  );
}
