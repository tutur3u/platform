'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from '@tuturuuu/icons';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useState } from 'react';
import {
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import { LifecyclePanel } from './operator-lifecycle';
import {
  invalidateSetup,
  type NamedResource,
  type ResourceConfig,
} from './setup-helpers';

export function ResourceDialog({
  config,
  item,
  trigger,
  wsId,
}: {
  config: ResourceConfig;
  item?: NamedResource;
  trigger: ReactNode;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(item?.name ?? '');
  const mutation = useMutation({
    mutationFn: () =>
      item ? config.update(item.id, name) : config.create(name),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      setOpen(false);
      setName(item?.name ?? '');
      invalidateSetup(queryClient, wsId);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => (item ? config.remove(item.id) : Promise.resolve()),
    onError: () => toast.error(t('deleteError')),
    onSuccess: () => {
      toast.success(t('deleteSuccess'));
      setOpen(false);
      invalidateSetup(queryClient, wsId);
    },
  });

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) setName(item?.name ?? '');
        setOpen(nextOpen);
      }}
      open={open}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <OperatorDialogContent mobileFullscreen size="sm">
        <OperatorDialogHeader
          description={
            item
              ? t('editResourceDescription', { resource: config.title })
              : t('createResourceDescription', { resource: config.title })
          }
          title={
            item
              ? t('editResourceTitle')
              : t('createResourceTitle', { resource: config.title })
          }
        />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (name) mutation.mutate();
          }}
        >
          <OperatorDialogBody className="grid gap-5">
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="font-medium">{config.title}</span>
              <Input
                onChange={(event) => setName(event.target.value)}
                placeholder={t('placeholders.resourceName', {
                  resource: config.title.toLowerCase(),
                })}
                value={name}
              />
            </label>
            {item ? (
              <LifecyclePanel
                deletePending={deleteMutation.isPending}
                onDelete={() => deleteMutation.mutate()}
                title={t('lifecycle')}
              />
            ) : null}
          </OperatorDialogBody>
          <OperatorDialogFooter className="grid grid-cols-2 sm:flex">
            <DialogClose asChild>
              <Button
                className="w-full sm:w-auto"
                type="button"
                variant="ghost"
              >
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button
              className="w-full sm:w-auto"
              disabled={!name || mutation.isPending}
              type="submit"
            >
              {item ? t('save') : t('create')}
            </Button>
          </OperatorDialogFooter>
        </form>
      </OperatorDialogContent>
    </Dialog>
  );
}

function ResourceRow({
  config,
  item,
  wsId,
}: {
  config: ResourceConfig;
  item: NamedResource;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');

  return (
    <div className="grid min-w-0 gap-2 border-border border-t p-2 text-sm first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <p className="truncate font-medium">{item.name ?? item.id}</p>
      <div className="flex items-center gap-2 sm:justify-end">
        <ResourceDialog
          config={config}
          item={item}
          trigger={
            <Button
              aria-label={t('edit')}
              className="h-10 w-10 touch-manipulation sm:h-9 sm:w-9"
              size="icon"
              type="button"
              variant="outline"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          }
          wsId={wsId}
        />
      </div>
    </div>
  );
}

export function ResourceSection({
  config,
  wsId,
}: {
  config: ResourceConfig;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const Icon = config.icon;

  return (
    <AccordionItem
      className="overflow-hidden rounded-lg border border-border bg-card px-3"
      value={config.key}
    >
      <AccordionTrigger className="py-3">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate font-medium text-sm">
            {config.title}
          </span>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 font-normal text-muted-foreground text-xs">
            {config.rows.length}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="grid min-w-0 gap-2 pb-3">
        {config.rows.length ? (
          <div className="overflow-hidden rounded-md border border-border">
            {config.rows.map((item) => (
              <ResourceRow
                config={config}
                item={item}
                key={`${config.key}-${item.id}`}
                wsId={wsId}
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{t('emptyResource')}</p>
        )}
        <ResourceDialog
          config={config}
          trigger={
            <Button
              className="min-h-10 w-full touch-manipulation sm:min-h-9 sm:w-fit"
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus className="h-4 w-4" />
              {t('create')}
            </Button>
          }
          wsId={wsId}
        />
      </AccordionContent>
    </AccordionItem>
  );
}
