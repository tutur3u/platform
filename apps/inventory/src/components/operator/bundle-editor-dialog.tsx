'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Boxes,
  FileImage,
  ImageIcon,
  Pencil,
  Save,
  Settings2,
  Tags,
} from '@tuturuuu/icons';
import type {
  InventoryBundle,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import {
  deleteInventoryBundle,
  updateInventoryBundle,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import {
  BundleComponentPicker,
  type DraftBundleComponent,
} from './bundle-component-picker';
import { InventoryImageUploadField } from './inventory-image-upload';
import {
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
  OperatorDialogTabs,
} from './operator-dialog-shell';
import {
  NumberField,
  SelectValueField,
  TextAreaField,
  TextField,
} from './operator-form-fields';
import { currency } from './operator-format';
import { LifecyclePanel } from './operator-lifecycle';

export function BundleEditorDialog({
  bundle,
  onOpenChange: onOpenChangeProp,
  open: openProp,
  products,
  wsId,
}: {
  bundle: InventoryBundle;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  products: InventoryProductSummary[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChangeProp?.(next);
  };
  const [details, setDetails] = useState(() => getInitialDetails(bundle));
  const [components, setComponents] = useState<DraftBundleComponent[]>(() =>
    getInitialComponents(bundle)
  );
  const estimatedPrice = useMemo(
    () =>
      components.reduce(
        (total, component) => total + component.unitPrice * component.quantity,
        0
      ),
    [components]
  );
  const canSave = Boolean(details.name.trim() && details.slug.trim());
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'bundles'] });
  };
  const saveMutation = useMutation({
    mutationFn: () =>
      updateInventoryBundle(wsId, bundle.id, {
        components: components.map((component) => ({
          productId: component.productId,
          quantity: component.quantity,
          unitId: component.unitId,
          warehouseId: component.warehouseId,
        })),
        description: details.description || null,
        imageUrl: details.imageUrl || null,
        maxPerOrder: Number(details.maxPerOrder || 99),
        name: details.name.trim(),
        price: Number(details.price || 0),
        slug: details.slug.trim(),
        status: details.status as InventoryBundle['status'],
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      invalidate();
    },
  });
  const archiveMutation = useMutation({
    mutationFn: () =>
      updateInventoryBundle(wsId, bundle.id, { status: 'archived' }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      setOpen(false);
      invalidate();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteInventoryBundle(wsId, bundle.id),
    onError: () => toast.error(t('deleteError')),
    onSuccess: () => {
      toast.success(t('deleteSuccess'));
      setOpen(false);
      invalidate();
    },
  });

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setDetails(getInitialDetails(bundle));
          setComponents(getInitialComponents(bundle));
        }
        setOpen(nextOpen);
      }}
      open={open}
    >
      {isControlled ? null : (
        <DialogTrigger asChild>
          <Button size="sm" type="button" variant="outline">
            <Pencil className="h-4 w-4" />
            {t('edit')}
          </Button>
        </DialogTrigger>
      )}
      <OperatorDialogContent size="lg">
        <OperatorDialogHeader
          description={t('editBundleDescription')}
          title={t('editBundleTitle')}
        />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) saveMutation.mutate();
          }}
        >
          <OperatorDialogTabs
            tabs={[
              {
                content: (
                  <div className="grid min-w-0 gap-3 lg:grid-cols-2 xl:grid-cols-4">
                    <TextField
                      className="xl:col-span-2"
                      label={t('bundleName')}
                      onChange={(name) =>
                        setDetails((current) => ({ ...current, name }))
                      }
                      placeholder={t('placeholders.bundleName')}
                      value={details.name}
                    />
                    <TextField
                      hint={t('hints.slug')}
                      label={t('slug')}
                      onChange={(slug) =>
                        setDetails((current) => ({ ...current, slug }))
                      }
                      placeholder={t('placeholders.slug')}
                      value={details.slug}
                    />
                    <SelectValueField
                      allowEmpty={false}
                      label={t('status')}
                      onChange={(status) =>
                        setDetails((current) => ({
                          ...current,
                          status: status as InventoryBundle['status'],
                        }))
                      }
                      options={[
                        { label: t('bundleStatus.draft'), value: 'draft' },
                        { label: t('bundleStatus.active'), value: 'active' },
                        { label: t('bundleStatus.paused'), value: 'paused' },
                        {
                          label: t('bundleStatus.archived'),
                          value: 'archived',
                        },
                      ]}
                      placeholder={t('placeholders.status')}
                      value={details.status}
                    />
                    <NumberField
                      hint={t('hints.price')}
                      label={t('price')}
                      onChange={(price) =>
                        setDetails((current) => ({ ...current, price }))
                      }
                      placeholder={t('placeholders.price')}
                      value={details.price}
                    />
                    <NumberField
                      hint={t('hints.maxPerOrder')}
                      label={t('maxPerOrder')}
                      onChange={(maxPerOrder) =>
                        setDetails((current) => ({ ...current, maxPerOrder }))
                      }
                      placeholder={t('placeholders.maxPerOrder')}
                      value={details.maxPerOrder}
                    />
                    <TextAreaField
                      className="lg:col-span-2 xl:col-span-4"
                      label={t('description')}
                      onChange={(description) =>
                        setDetails((current) => ({ ...current, description }))
                      }
                      placeholder={t('placeholders.bundleDescription')}
                      value={details.description}
                    />
                  </div>
                ),
                icon: <Tags className="h-4 w-4" />,
                label: t('tabs.details'),
                value: 'details',
              },
              {
                badge: components.length || undefined,
                content: (
                  <BundleComponentPicker
                    components={components}
                    onChange={setComponents}
                    products={products}
                  />
                ),
                icon: <Boxes className="h-4 w-4" />,
                label: t('tabs.components'),
                value: 'components',
              },
              {
                content: (
                  <InventoryImageUploadField
                    description={t('bundleImageDescription')}
                    label={t('bundleImage')}
                    onChange={(imageUrl) =>
                      setDetails((current) => ({ ...current, imageUrl }))
                    }
                    target="bundle-image"
                    value={details.imageUrl}
                    wsId={wsId}
                  />
                ),
                icon: <FileImage className="h-4 w-4" />,
                label: t('tabs.media'),
                value: 'media',
              },
              {
                content: (
                  <div className="grid min-w-0 gap-3 lg:grid-cols-3">
                    <AvailabilityCard
                      icon={<Boxes className="h-4 w-4" />}
                      label={t('components')}
                      value={String(components.length)}
                    />
                    <AvailabilityCard
                      icon={<ImageIcon className="h-4 w-4" />}
                      label={t('price')}
                      value={currency(
                        Number(details.price || estimatedPrice || 0)
                      )}
                    />
                    <AvailabilityCard
                      icon={<Boxes className="h-4 w-4" />}
                      label={t('availability')}
                      value={
                        bundle.availableQuantity === null
                          ? t('unlimitedStock')
                          : String(bundle.availableQuantity ?? 0)
                      }
                    />
                  </div>
                ),
                icon: <Boxes className="h-4 w-4" />,
                label: t('tabs.availability'),
                value: 'availability',
              },
              {
                content: (
                  <LifecyclePanel
                    archivePending={archiveMutation.isPending}
                    deletePending={deleteMutation.isPending}
                    onArchive={() => archiveMutation.mutate()}
                    onDelete={() => deleteMutation.mutate()}
                    title={t('lifecycle')}
                  />
                ),
                icon: <Settings2 className="h-4 w-4" />,
                label: t('tabs.lifecycle'),
                value: 'lifecycle',
              },
            ]}
          />
          <OperatorDialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button disabled={!canSave || saveMutation.isPending} type="submit">
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? t('saving') : t('save')}
            </Button>
          </OperatorDialogFooter>
        </form>
      </OperatorDialogContent>
    </Dialog>
  );
}

function AvailabilityCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid min-w-0 gap-2 rounded-lg border border-border bg-muted/15 p-3">
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="truncate font-semibold text-lg">{value}</p>
    </div>
  );
}

function getInitialDetails(bundle: InventoryBundle) {
  return {
    description: bundle.description ?? '',
    imageUrl: bundle.imageUrl ?? '',
    maxPerOrder: String(bundle.maxPerOrder ?? 99),
    name: bundle.name,
    price: String(bundle.price ?? 0),
    slug: bundle.slug,
    status: bundle.status,
  };
}

function getInitialComponents(bundle: InventoryBundle): DraftBundleComponent[] {
  return bundle.components.map((component) => ({
    id: `${component.productId}-${component.unitId}-${component.warehouseId}`,
    productId: component.productId,
    productName: component.productName ?? component.productId,
    quantity: component.quantity,
    unitId: component.unitId,
    unitName: component.unitName,
    unitPrice: 0,
    warehouseId: component.warehouseId,
    warehouseName: component.warehouseName,
  }));
}
