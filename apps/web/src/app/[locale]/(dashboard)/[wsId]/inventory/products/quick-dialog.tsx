'use client';

import { Edit, Eye, History, Package } from '@tuturuuu/icons';
import type { Product } from '@tuturuuu/types/primitives/Product';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import type { ProductUnit } from '@tuturuuu/types/primitives/ProductUnit';
import type { ProductWarehouse } from '@tuturuuu/types/primitives/ProductWarehouse';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import type * as z from 'zod';
import { useWorkspaceProduct } from './hooks';
import { ProductDeleteDialog } from './quick-dialog-components/ProductDeleteDialog';
import { ProductDetailsTab } from './quick-dialog-components/ProductDetailsTab';
import { ProductEditTab } from './quick-dialog-components/ProductEditTab';
import { ProductHistoryTab } from './quick-dialog-components/ProductHistoryTab';
import { ProductInventoryTab } from './quick-dialog-components/ProductInventoryTab';
import { EditProductSchema } from './quick-dialog-components/schema';
import { useProductMutations } from './quick-dialog-components/useProductMutations';

interface Props {
  product?: Product;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  wsId: string;
  categories: ProductCategory[];
  warehouses: ProductWarehouse[];
  units: ProductUnit[];
  canUpdateInventory: boolean;
  canDeleteInventory: boolean;
}

export function ProductQuickDialog({
  product,
  isOpen,
  onOpenChange,
  wsId,
  categories,
  warehouses,
  units,
  canUpdateInventory,
  canDeleteInventory,
}: Props) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const t = useTranslations();

  const {
    updateProductMutation,
    updateInventoryMutation,
    deleteProductMutation,
  } = useProductMutations();

  const { data: fetchedProduct } = useWorkspaceProduct(wsId, product?.id, {
    enabled: isOpen && !!product?.id,
  });

  const displayProduct = fetchedProduct || product;

  const computeUnlimitedStock = useCallback(
    (p?: Product) =>
      !p?.stock ||
      p.stock.length === 0 ||
      p.stock.some((s) => s.amount == null),
    []
  );

  const [hasUnlimitedStock, setHasUnlimitedStock] = useState(
    computeUnlimitedStock(displayProduct)
  );

  const editForm = useForm({
    resolver: zodResolver(EditProductSchema),
    defaultValues: {
      name: displayProduct?.name || '',
      manufacturer: displayProduct?.manufacturer || '',
      description: displayProduct?.description || '',
      usage: displayProduct?.usage || '',
      category_id: displayProduct?.category_id || '',
      inventory: hasUnlimitedStock
        ? []
        : displayProduct?.inventory && displayProduct.inventory.length > 0
          ? displayProduct.inventory
          : [
              {
                unit_id: '',
                warehouse_id: '',
                min_amount: displayProduct?.min_amount || 0,
                amount: 0,
                price: 0,
              },
            ],
    },
  });

  useEffect(() => {
    if (displayProduct) {
      const isUnlimited = computeUnlimitedStock(displayProduct);
      setHasUnlimitedStock(isUnlimited);
      editForm.reset({
        name: displayProduct.name || '',
        manufacturer: displayProduct.manufacturer || '',
        description: displayProduct.description || '',
        usage: displayProduct.usage || '',
        category_id: displayProduct.category_id || '',
        inventory: isUnlimited
          ? []
          : displayProduct.inventory && displayProduct.inventory.length > 0
            ? displayProduct.inventory
            : [
                {
                  unit_id: '',
                  warehouse_id: '',
                  min_amount: displayProduct.min_amount || 0,
                  amount: 0,
                  price: 0,
                },
              ],
      });
    }
  }, [displayProduct, editForm, computeUnlimitedStock]);

  function toggleUnlimitedStock(unlimited: boolean) {
    setHasUnlimitedStock(unlimited);
    if (unlimited) {
      editForm.setValue('inventory', [], { shouldDirty: true });
    } else {
      const currentValues = editForm.getValues();
      const newValues = {
        ...currentValues,
        inventory: [
          {
            unit_id: '',
            warehouse_id: '',
            min_amount: displayProduct?.min_amount || 0,
            amount: 0,
            price: 0,
          },
        ],
      };
      editForm.reset(newValues);
    }
  }

  const handleEditSave = async (data: z.infer<typeof EditProductSchema>) => {
    if (!displayProduct?.id) return;

    if (!canUpdateInventory) {
      toast.error(t('ws-roles.inventory_products_access_denied_description'));
      return;
    }

    try {
      const productPayload: any = {};
      let hasProductChanges = false;
      let hasInventoryChanges = false;

      if (data.name !== (displayProduct.name || '')) {
        productPayload.name = data.name;
        hasProductChanges = true;
      }
      if (data.manufacturer !== (displayProduct.manufacturer || '')) {
        productPayload.manufacturer = data.manufacturer;
        hasProductChanges = true;
      }
      if (data.description !== (displayProduct.description || '')) {
        productPayload.description = data.description;
        hasProductChanges = true;
      }
      if (data.usage !== (displayProduct.usage || '')) {
        productPayload.usage = data.usage;
        hasProductChanges = true;
      }
      if (data.category_id !== (displayProduct.category_id || '')) {
        productPayload.category_id = data.category_id;
        hasProductChanges = true;
      }

      const originalInventory = (displayProduct as any).inventory || [];
      const newInventory = data.inventory || [];

      const originalIsUnlimited =
        originalInventory.length === 0 || computeUnlimitedStock(displayProduct);
      const newIsUnlimited = newInventory.length === 0;

      if (originalIsUnlimited !== newIsUnlimited) {
        hasInventoryChanges = true;
      }

      const changedInventoryItems = newInventory.filter((newItem, index) => {
        const originalItem = originalInventory[index];
        if (!originalItem) return true;
        return (
          newItem.unit_id !== originalItem.unit_id ||
          newItem.warehouse_id !== originalItem.warehouse_id ||
          Number(newItem.amount) !== Number(originalItem.amount) ||
          Number(newItem.min_amount) !== Number(originalItem.min_amount) ||
          Number(newItem.price) !== Number(originalItem.price)
        );
      });

      const hasRemovedItems = originalInventory.length > newInventory.length;
      if (changedInventoryItems.length > 0 || hasRemovedItems) {
        hasInventoryChanges = true;
      }

      if (!hasProductChanges && !hasInventoryChanges) {
        toast.info(t('ws-inventory-products.messages.no_changes_to_save'));
        return;
      }

      if (hasProductChanges) {
        await updateProductMutation.mutateAsync({
          wsId,
          productId: displayProduct.id,
          payload: productPayload,
        });
      }

      if (hasInventoryChanges) {
        await updateInventoryMutation.mutateAsync({
          wsId,
          productId: displayProduct.id,
          inventory: newInventory,
        });
      }

      toast.success(
        t('ws-inventory-products.messages.product_updated_successfully')
      );
    } catch (error) {
      console.error('Error updating product:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : t('ws-inventory-products.messages.failed_update_product')
      );
    }
  };

  const handleDelete = async () => {
    if (!displayProduct?.id) return;
    await deleteProductMutation.mutateAsync({
      wsId,
      productId: displayProduct.id,
    });
    setShowDeleteDialog(false);
    onOpenChange(false);
  };

  if (!displayProduct) return null;

  const isSaving =
    updateProductMutation.isPending || updateInventoryMutation.isPending;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {displayProduct.name || t('ws-inventory-products.singular')}
            </DialogTitle>
            <DialogDescription>
              {t('ws-inventory-products.dialog.description')}
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList
              className={`grid w-full ${hasUnlimitedStock ? 'grid-cols-3' : 'grid-cols-4'}`}
            >
              <TabsTrigger value="details" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                {t('ws-inventory-products.tabs.details')}
              </TabsTrigger>
              {!hasUnlimitedStock && (
                <TabsTrigger
                  value="inventory"
                  className="flex items-center gap-2"
                >
                  <Package className="h-4 w-4" />
                  {t('ws-inventory-products.tabs.stock')}
                </TabsTrigger>
              )}
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                {t('ws-inventory-products.tabs.history')}
              </TabsTrigger>
              {canUpdateInventory && (
                <TabsTrigger value="edit" className="flex items-center gap-2">
                  <Edit className="h-4 w-4" />
                  {t('ws-inventory-products.tabs.edit')}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <ProductDetailsTab
                product={displayProduct}
                hasUnlimitedStock={hasUnlimitedStock}
              />
            </TabsContent>

            {!hasUnlimitedStock && (
              <TabsContent value="inventory" className="space-y-4">
                <ProductInventoryTab
                  form={editForm}
                  warehouses={warehouses}
                  units={units}
                  isSaving={isSaving}
                  onSave={editForm.handleSubmit(handleEditSave)}
                  canUpdateInventory={canUpdateInventory}
                />
              </TabsContent>
            )}

            <TabsContent value="history" className="space-y-4">
              <ProductHistoryTab product={displayProduct} />
            </TabsContent>

            <TabsContent value="edit" className="space-y-4">
              <ProductEditTab
                product={displayProduct}
                form={editForm}
                categories={categories}
                hasUnlimitedStock={hasUnlimitedStock}
                onToggleUnlimitedStock={toggleUnlimitedStock}
                onSave={handleEditSave}
                onDelete={() => setShowDeleteDialog(true)}
                isSaving={isSaving}
                canUpdateInventory={canUpdateInventory}
                canDeleteInventory={canDeleteInventory}
                onCancel={() => onOpenChange(false)}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <ProductDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        isDeleting={deleteProductMutation.isPending}
        productName={displayProduct.name ?? ''}
      />
    </>
  );
}
