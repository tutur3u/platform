'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings2 } from '@tuturuuu/icons';
import {
  type InventoryPolarEnvironment,
  updateInventoryPolarSettings,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useState } from 'react';
import {
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import { SelectValueField } from './operator-form-fields';

const environments: InventoryPolarEnvironment[] = ['sandbox', 'production'];

export function PolarTokenDialog({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator.polar');
  const formsText = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [environment, setEnvironment] =
    useState<InventoryPolarEnvironment>('sandbox');
  const mutation = useMutation({
    mutationFn: () =>
      updateInventoryPolarSettings(wsId, {
        accessToken: accessToken || undefined,
        environment,
        webhookSecret: webhookSecret || undefined,
      }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('saveError')),
    onSuccess: () => {
      setOpen(false);
      setAccessToken('');
      setWebhookSecret('');
      toast.success(t('saveSuccess'));
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'polar-settings'],
      });
    },
  });
  const options = environments.map((value) => ({
    label: t(`environment.${value}`),
    value,
  }));

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <Settings2 className="size-4" />
          {t('manage')}
        </Button>
      </DialogTrigger>
      <OperatorDialogContent size="sm">
        <OperatorDialogHeader
          description={t('dialogDescription')}
          title={t('dialogTitle')}
        />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <OperatorDialogBody className="grid gap-6">
            <SelectValueField
              allowEmpty={false}
              emptyText={t('emptyEnvironments')}
              label={t('environmentLabel')}
              onChange={(value) =>
                setEnvironment(value as InventoryPolarEnvironment)
              }
              options={options}
              placeholder={t('environmentLabel')}
              searchPlaceholder={t('searchEnvironments')}
              value={environment}
            />
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="font-medium">{t('tokenLabel')}</span>
              <Input
                className="h-10"
                onChange={(event) => setAccessToken(event.target.value)}
                placeholder={t('tokenPlaceholder')}
                type="password"
                value={accessToken}
              />
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="font-medium">{t('webhookSecretLabel')}</span>
              <Input
                className="h-10"
                onChange={(event) => setWebhookSecret(event.target.value)}
                placeholder={t('webhookSecretPlaceholder')}
                type="password"
                value={webhookSecret}
              />
              <span className="text-muted-foreground text-xs">
                {t('webhookHint')}
              </span>
            </label>
          </OperatorDialogBody>
          <OperatorDialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {formsText('cancel')}
              </Button>
            </DialogClose>
            <Button disabled={mutation.isPending} type="submit">
              {mutation.isPending ? t('saving') : t('saveToken')}
            </Button>
          </OperatorDialogFooter>
        </form>
      </OperatorDialogContent>
    </Dialog>
  );
}
