'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useState } from 'react';
import { operatorDialogContentClassName } from './operator-dialog';
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

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) setName(item?.name ?? '');
        setOpen(nextOpen);
      }}
      open={open}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={operatorDialogContentClassName('compact')}>
        <DialogHeader>
          <DialogTitle>
            {item
              ? t('editResourceTitle')
              : t('createResourceTitle', {
                  resource: config.title,
                })}
          </DialogTitle>
          <DialogDescription>
            {item
              ? t('editResourceDescription', { resource: config.title })
              : t('createResourceDescription', { resource: config.title })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (name) mutation.mutate();
          }}
        >
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
          <DialogFooter>
            <Button disabled={!name || mutation.isPending} type="submit">
              {item ? t('save') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
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
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: () => config.remove(item.id),
    onError: () => toast.error(t('deleteError')),
    onSuccess: () => {
      toast.success(t('deleteSuccess'));
      invalidateSetup(queryClient, wsId);
    },
  });

  return (
    <div className="grid min-w-0 gap-2 border-border border-t p-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <p className="truncate font-medium">{item.name ?? item.id}</p>
      <div className="flex items-center gap-2 sm:justify-end">
        <ResourceDialog
          config={config}
          item={item}
          trigger={
            <Button size="icon" type="button" variant="outline">
              <Pencil className="h-4 w-4" />
            </Button>
          }
          wsId={wsId}
        />
        <Button
          disabled={deleteMutation.isPending}
          onClick={() => deleteMutation.mutate()}
          size="icon"
          type="button"
          variant="destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
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
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid min-w-0 gap-3 border-border border-b px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{config.title}</p>
            <p className="text-muted-foreground text-xs">
              {config.rows.length}
            </p>
          </div>
        </div>
        <ResourceDialog
          config={config}
          trigger={
            <Button size="sm" type="button">
              <Plus className="h-4 w-4" />
              {t('create')}
            </Button>
          }
          wsId={wsId}
        />
      </div>
      {config.rows.length
        ? config.rows.map((item) => (
            <ResourceRow
              config={config}
              item={item}
              key={`${config.key}-${item.id}`}
              wsId={wsId}
            />
          ))
        : null}
    </section>
  );
}
