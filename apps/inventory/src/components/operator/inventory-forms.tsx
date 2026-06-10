'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from '@tuturuuu/icons';
import {
  createInventoryBundle,
  createInventoryStorefront,
  type InventoryStorefrontVisibility,
} from '@tuturuuu/internal-api/inventory';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

export function StorefrontForm({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [visibility, setVisibility] =
    useState<InventoryStorefrontVisibility>('public');
  const mutation = useMutation({
    mutationFn: () =>
      createInventoryStorefront(wsId, {
        name,
        slug,
        status: 'draft',
        visibility,
      }),
    onError: () => toast.error(t('forms.createStorefrontError')),
    onSuccess: () => {
      setName('');
      setSlug('');
      setVisibility('public');
      toast.success(t('forms.createStorefrontSuccess'));
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'storefronts'],
      });
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'overview'],
      });
    },
  });

  return (
    <form
      className="grid gap-2 border-border border-t p-3 lg:grid-cols-[1fr_1fr_140px_auto]"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <input
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        onChange={(event) => setName(event.target.value)}
        placeholder={t('forms.storeName')}
        value={name}
      />
      <input
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        onChange={(event) => setSlug(event.target.value)}
        placeholder={t('forms.slug')}
        value={slug}
      />
      <select
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        onChange={(event) =>
          setVisibility(event.target.value as InventoryStorefrontVisibility)
        }
        value={visibility}
      >
        <option value="public">{t('forms.visibilityPublic')}</option>
        <option value="private">{t('forms.visibilityPrivate')}</option>
      </select>
      <button
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-dynamic-blue px-3 font-medium text-dynamic-blue-foreground text-sm disabled:opacity-50"
        disabled={!name || !slug || mutation.isPending}
        type="submit"
      >
        <Plus className="h-4 w-4" />
        {mutation.isPending ? t('forms.creating') : t('forms.create')}
      </button>
    </form>
  );
}

export function BundleForm({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [price, setPrice] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      createInventoryBundle(wsId, {
        name,
        price: Number(price || 0),
        slug,
        status: 'draft',
      }),
    onError: () => toast.error(t('forms.createBundleError')),
    onSuccess: () => {
      setName('');
      setSlug('');
      setPrice('');
      toast.success(t('forms.createBundleSuccess'));
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'bundles'],
      });
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'overview'],
      });
    },
  });

  return (
    <form
      className="grid gap-2 border-border border-t p-3 lg:grid-cols-[1fr_1fr_120px_auto]"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <input
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        onChange={(event) => setName(event.target.value)}
        placeholder={t('forms.bundleName')}
        value={name}
      />
      <input
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        onChange={(event) => setSlug(event.target.value)}
        placeholder={t('forms.slug')}
        value={slug}
      />
      <input
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        inputMode="numeric"
        onChange={(event) => setPrice(event.target.value)}
        placeholder={t('forms.price')}
        value={price}
      />
      <button
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-dynamic-blue px-3 font-medium text-dynamic-blue-foreground text-sm disabled:opacity-50"
        disabled={!name || !slug || mutation.isPending}
        type="submit"
      >
        <Plus className="h-4 w-4" />
        {mutation.isPending ? t('forms.creating') : t('forms.create')}
      </button>
    </form>
  );
}
