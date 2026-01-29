'use client';

import { Edit, Eye, History, Package } from '@tuturuuu/icons';
import type { Product } from '@tuturuuu/types/primitives/Product';
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
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import {
  useProductCategories,
  useProductUnits,
  useProductWarehouses,
  useWorkspaceProduct,
} from './hooks';
import { ProductDeleteDialog } from './quick-dialog-components/ProductDeleteDialog';
import { ProductDetailsTab } from './quick-dialog-components/ProductDetailsTab';
import { ProductEditTab } from './quick-dialog-components/ProductEditTab';
import { ProductHistoryTab } from './quick-dialog-components/ProductHistoryTab';
import { ProductInventoryTab } from './quick-dialog-components/ProductInventoryTab';
import {
  type EditProductFormValues,
  EditProductSchema,
} from './quick-dialog-components/schema';
import { useProductMutations } from './quick-dialog-components/useProductMutations';

interface Props {
  product?: Product;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  wsId: string;
  canUpdateInventory: boolean;
  canDeleteInventory: boolean;
  canViewStockQuantity: boolean;
  canUpdateStockQuantity: boolean;
}

export function ProductQuickDialog({
  product,
  isOpen,
  onOpenChange,
  wsId,
  canUpdateInventory,
  canDeleteInventory,
  canViewStockQuantity,
  canUpdateStockQuantity,
}: Props) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const t = useTranslations();

  const {
    updateProductMutation,
    updateInventoryMutation,
    deleteProductMutation,
  } = useProductMutations();

  const { data: fetchedProduct, isLoading: isProductLoading } =
    useWorkspaceProduct(wsId, product?.id, {
      enabled: isOpen && !!product?.id,
    });

  const { data: categories = [] } = useProductCategories(wsId, {
    enabled: isOpen,
  });

  const { data: warehouses = [] } = useProductWarehouses(wsId, {
    enabled: isOpen,
  });

  const { data: units = [] } = useProductUnits(wsId, {
    enabled: isOpen,
  });

  const displayProduct = fetchedProduct || product;

  const computeUnlimitedStock = useCallback(
    (p?: Product) => p?.stock?.some((s) => s.amount == null) ?? false,
    []
  );

  const [hasUnlimitedStock, setHasUnlimitedStock] = useState(
    computeUnlimitedStock(displayProduct)
  );

  const buildInventoryDefaults = useCallback(
    (product?: Product, forceUnlimited?: boolean) => {
      if (product?.inventory && product.inventory.length > 0) {
        return product.inventory.map((item) => ({
          unit_id: item.unit_id,
          warehouse_id: item.warehouse_id,
          amount: item.amount == null ? null : Number(item.amount),
          min_amount: Number(item.min_amount) || 0,
          price: Number(item.price) || 0,
        }));
      }

      return [
        {
          unit_id: '',
          warehouse_id: '',
          min_amount: Number(product?.min_amount) || 0,
          amount: forceUnlimited ? null : 0,
          price: 0,
        },
      ];
    },
    []
  );

  const editForm = useForm<EditProductFormValues>({
    resolver: zodResolver(EditProductSchema),
    defaultValues: {
      name: displayProduct?.name || '',
      manufacturer: displayProduct?.manufacturer || '',
      description: displayProduct?.description || '',
      usage: displayProduct?.usage || '',
      category_id: displayProduct?.category_id || '',
      inventory: buildInventoryDefaults(
        displayProduct,
        computeUnlimitedStock(displayProduct)
      ),
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
        inventory: buildInventoryDefaults(displayProduct, isUnlimited),
      });
    }
  }, [displayProduct, editForm, computeUnlimitedStock, buildInventoryDefaults]);

  function toggleUnlimitedStock(unlimited: boolean) {
    setHasUnlimitedStock(unlimited);
    if (unlimited) {
      const currentInventory = editForm.getValues('inventory') || [];
      const updatedInventory =
        currentInventory.length > 0
          ? currentInventory.map((item) => ({
              ...item,
              amount: null,
              min_amount: 0,
            }))
          : [
              {
                unit_id: '',
                warehouse_id: '',
                min_amount: 0,
                amount: null,
                price: 0,
              },
            ];
      editForm.setValue('inventory', updatedInventory, { shouldDirty: true });
    } else {
      const currentInventory = editForm.getValues('inventory') || [];
      const updatedInventory =
        currentInventory.length > 0
          ? currentInventory.map((item) => ({
              ...item,
              amount: item.amount == null ? 0 : item.amount,
            }))
          : [
              {
                unit_id: '',
                warehouse_id: '',
                min_amount: Number(displayProduct?.min_amount) || 0,
                amount: 0,
                price: 0,
              },
            ];
      editForm.setValue('inventory', updatedInventory, { shouldDirty: true });
    }
  }

  const handleEditSave = async (data: EditProductFormValues) => {
    if (!displayProduct?.id) return;

    try {
      const productPayload: Partial<Product> = {};
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

      let newInventory: EditProductFormValues['inventory'] = [];

      if (canUpdateStockQuantity) {
        const originalInventory = displayProduct.inventory || [];
        newInventory = data.inventory || [];

        const originalIsUnlimited = computeUnlimitedStock(displayProduct);
        const newIsUnlimited = newInventory.some((item) => item.amount == null);

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
      }

      if (hasProductChanges && !canUpdateInventory) {
        toast.error(t('common.insufficient_permissions'));
        return;
      }

      if (hasInventoryChanges && !canUpdateStockQuantity) {
        toast.error(t('common.insufficient_permissions'));
        return;
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
          inventory: newInventory ?? [],
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
              className={cn(
                'grid w-full',
                canViewStockQuantity && canUpdateInventory
                  ? 'grid-cols-4'
                  : canViewStockQuantity
                    ? 'grid-cols-3'
                    : canUpdateInventory
                      ? 'grid-cols-2'
                      : 'grid-cols-1'
              )}
            >
              <TabsTrigger value="details" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                {t('ws-inventory-products.tabs.details')}
              </TabsTrigger>
              {canViewStockQuantity && (
                <TabsTrigger
                  value="inventory"
                  className="flex items-center gap-2"
                >
                  <Package className="h-4 w-4" />
                  {t('ws-inventory-products.tabs.stock')}
                </TabsTrigger>
              )}
              {canViewStockQuantity && (
                <TabsTrigger
                  value="history"
                  className="flex items-center gap-2"
                >
                  <History className="h-4 w-4" />
                  {t('ws-inventory-products.tabs.history')}
                </TabsTrigger>
              )}
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
                canViewStockQuantity={canViewStockQuantity}
              />
            </TabsContent>

            {canViewStockQuantity && (
              <TabsContent value="inventory" className="space-y-4">
                <ProductInventoryTab
                  form={editForm}
                  warehouses={warehouses}
                  units={units}
                  isSaving={isSaving}
                  isLoading={isProductLoading}
                  onSave={editForm.handleSubmit(handleEditSave)}
                  canUpdateStockQuantity={canUpdateStockQuantity}
                  hasUnlimitedStock={hasUnlimitedStock}
                  onToggleUnlimitedStock={toggleUnlimitedStock}
                />
              </TabsContent>
            )}

            {canViewStockQuantity && (
              <TabsContent value="history" className="space-y-4">
                <ProductHistoryTab
                  product={displayProduct}
                  isLoading={isProductLoading}
                />
              </TabsContent>
            )}

            <TabsContent value="edit" className="space-y-4">
              <ProductEditTab
                product={displayProduct}
                form={editForm}
                categories={categories}
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
