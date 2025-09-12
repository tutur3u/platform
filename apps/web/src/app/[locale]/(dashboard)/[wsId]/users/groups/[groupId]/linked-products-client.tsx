'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Combobox, type ComboboxOptions } from '@tuturuuu/ui/custom/combobox';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Box,
  MoreHorizontal,
  Pencil,
  Trash2,
  Warehouse,
  RulerDimensionLine,
  AlertCircle,
  Link,
} from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface LinkedProduct {
  id: string;
  name: string | null;
  description: string | null;
  warehouse_id?: string | null;
  unit_id?: string | null;
}

interface WorkspaceProduct {
  id: string;
  name: string | null;
  description: string | null;
  manufacturer: string | null;
  category_id: string;
  inventory_products: Array<{
    unit_id: string;
    warehouse_id: string;
    inventory_units: {
      name: string | null;
    } | null;
  }>;
}

interface WarehouseOption {
  id: string;
  name: string | null;
}

interface LinkedProductsClientProps {
  wsId: string;
  groupId: string;
  initialLinkedProducts: LinkedProduct[];
  initialCount: number;
}

export const useProducts = (wsId: string) => {
  return useQuery({
    queryKey: ['products', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_products')
        .select(
          `id, name, description, manufacturer,category_id, inventory_products!inventory_products_product_id_fkey(unit_id, warehouse_id, inventory_units!inventory_products_unit_id_fkey(name))`
        )
        .eq('ws_id', wsId)
        .order('name');

      if (error) {
        toast(
          error instanceof Error
            ? error.message
            : { t('ws-groups.failed_to_fetch_available_products') }
        );
        return [];
      }
      return data as WorkspaceProduct[];
    },
  });
};

export const useWarehouses = (wsId: string) => {
  return useQuery({
    queryKey: ['warehouses', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('inventory_warehouses')
        .select('id, name')
        .eq('ws_id', wsId)
        .order('name');

      if (error) {
        toast(
          error instanceof Error ? error.message : { t('ws-groups.failed_to_fetch_warehouses') }
        );
        return [];
      }
      return data as WarehouseOption[];
    },
  });
};

export default function LinkedProductsClient({
  wsId,
  groupId,
  initialLinkedProducts,
  initialCount,
}: LinkedProductsClientProps) {
  const t = useTranslations();
  const [linkedProducts, setLinkedProducts] = useState(initialLinkedProducts);
  const [count, setCount] = useState(initialCount);
  const { data: workspaceProducts } = useProducts(wsId);
  const { data: warehouses } = useWarehouses(wsId);
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [deletingProduct, setDeletingProduct] = useState<LinkedProduct | null>(
    null
  );
  const [editingProduct, setEditingProduct] = useState<LinkedProduct | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  // Mutations
  const addLinkedProductMutation = useMutation({
    mutationFn: async ({
      productId,
      warehouseId,
      unitId,
    }: { productId: string; warehouseId: string; unitId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('user_group_linked_products')
        .insert({
          group_id: groupId,
          product_id: productId,
          warehouse_id: warehouseId,
          unit_id: unitId,
        });
      if (error) throw error;
      const matched = (workspaceProducts ?? []).find((p) => p.id === productId);
      const newLinked: LinkedProduct = {
        id: productId,
        name: matched?.name ?? null,
        description: matched?.description ?? null,
        warehouse_id: warehouseId,
        unit_id: unitId,
      };
      return newLinked;
    },
    onSuccess: (newLinked) => {
      setLinkedProducts((prev) => [...prev, newLinked]);
      setCount((c) => c + 1);
      setIsAddDialogOpen(false);
      setSelectedProduct('');
      setSelectedWarehouse('');
      setSelectedUnit('');
      toast(t('ws-groups.linked_product_added_successfully'));
      // Optionally invalidate related queries if present elsewhere
      queryClient.invalidateQueries({ queryKey: ['products', wsId] });
    },
    onError: (error: unknown) => {
      toast(error instanceof Error ? error.message : t('ws-groups.failed_to_add_linked_product'));
    },
  });

  const deleteLinkedProductMutation = useMutation({
    mutationFn: async ({ productId }: { productId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('user_group_linked_products')
        .delete()
        .eq('group_id', groupId)
        .eq('product_id', productId);
      if (error) throw error;
      return { productId };
    },
    onSuccess: ({ productId }) => {
      setLinkedProducts((prev) => prev.filter((p) => p.id !== productId));
      setCount((c) => Math.max(0, c - 1));
      setIsDeleteDialogOpen(false);
      setDeletingProduct(null);
      toast(t('ws-groups.linked_product_removed_successfully'));
      queryClient.invalidateQueries({ queryKey: ['products', wsId] });
    },
    onError: (error: unknown) => {
      toast(error instanceof Error ? error.message : t('ws-groups.failed_to_delete_linked_product'));
    },
  });

  const updateLinkedProductMutation = useMutation({
    mutationFn: async ({
      productId,
      warehouseId,
      unitId,
    }: { productId: string; warehouseId: string; unitId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('user_group_linked_products')
        .update({
          warehouse_id: warehouseId,
          unit_id: unitId,
        })
        .eq('group_id', groupId)
        .eq('product_id', productId);
      if (error) throw error;
      return { productId, warehouseId, unitId };
    },
    onSuccess: ({ productId, warehouseId, unitId }) => {
      setLinkedProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, warehouse_id: warehouseId, unit_id: unitId } : p
        )
      );
      setIsEditDialogOpen(false);
      setEditingProduct(null);
      setSelectedProduct('');
      setSelectedWarehouse('');
      setSelectedUnit('');
      toast(t('ws-groups.linked_product_updated_successfully'));
      queryClient.invalidateQueries({ queryKey: ['products', wsId] });
    },
    onError: (error: unknown) => {
      toast(error instanceof Error ? error.message : t('ws-groups.failed_to_update_linked_product'));
    },
  });

  // Get available units for selected product
  const getAvailableUnits = (productId: string, warehouseId: string) => {
    const product = workspaceProducts?.find((p) => p.id === productId);
    const list = product?.inventory_products || [];
    if (!warehouseId) return [] as WorkspaceProduct['inventory_products'];
    return list.filter((ip) => ip.warehouse_id === warehouseId);
  };

  const getWarehouseName = (warehouseId?: string | null) => {
    if (!warehouseId) return null;
    const wh = (warehouses ?? []).find((w) => w.id === warehouseId);
    return wh?.name ?? null;
  };

  const getUnitName = (
    productId?: string,
    warehouseId?: string | null,
    unitId?: string | null
  ) => {
    if (!productId || !warehouseId || !unitId) return null;
    const unit = getAvailableUnits(productId, warehouseId).find(
      (u) => u.unit_id === unitId
    );
    return unit?.inventory_units?.name ?? null;
  };

  // Add linked product
  const handleAddProduct = async () => {
    if (!selectedProduct || !selectedWarehouse || !selectedUnit) {
      toast(t('ws-groups.select_product_warehouse_unit'));
      return;
    }

    setLoading(true);
    try {
      await addLinkedProductMutation.mutateAsync({
        productId: selectedProduct,
        warehouseId: selectedWarehouse,
        unitId: selectedUnit,
      });
    } catch (_) {
      // error handled in onError
    } finally {
      setLoading(false);
    }
  };

  // Delete linked product
  const handleDeleteProduct = async () => {
    if (!deletingProduct) return;

    setLoading(true);
    try {
      await deleteLinkedProductMutation.mutateAsync({ productId: deletingProduct.id });
    } catch (_) {
      // error handled in onError
    } finally {
      setLoading(false);
    }
  };



  // Edit linked product (update warehouse and unit)
  const openEditDialog = (product: LinkedProduct) => {
    setEditingProduct(product);
    setSelectedProduct(product.id);
    setSelectedWarehouse(product.warehouse_id || '');
    setSelectedUnit(product.unit_id || '');
    setIsEditDialogOpen(true);
  };

  const handleEditProduct = async () => {
    if (!editingProduct) return;
    if (!selectedWarehouse || !selectedUnit) {
      toast(t('ws-groups.select_warehouse_and_unit'));
      return;
    }

    setLoading(true);
    try {
      await updateLinkedProductMutation.mutateAsync({
        productId: editingProduct.id,
        warehouseId: selectedWarehouse,
        unitId: selectedUnit,
      });
    } catch (_) {
      // error handled in onError
    } finally {
      setLoading(false);
    }
  };

  // Get available products for selection (excluding already linked ones)
  const availableProducts =
    workspaceProducts?.filter(
      (product) => !linkedProducts.some((linked) => linked.id === product.id)
    ) || [];

  return (
    <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-semibold text-xl">
          {t('user-data-table.linked_products')}
          {!!count && ` (${count})`}
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Link className="mr-2 h-4 w-4" />
              {t('user-data-table.link_product')}
            </Button>
          </DialogTrigger>
          <DialogContent onWheel={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>{t('user-data-table.link_product')}</DialogTitle>
              <DialogDescription>
                {t('user-data-table.link_product_description')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="product-select">
                  {t('ws-inventory-products.singular')}
                </Label>
                <Combobox
                  t={t}
                  options={availableProducts.map(
                    (product): ComboboxOptions => ({
                      value: product.id,
                      label: `${product.name || t('ws-inventory-products.unnamed_product')}${product.manufacturer ? ` - ${product.manufacturer}` : ''}${product.description ? ` (${product.description})` : ''}`,
                    })
                  )}
                  selected={selectedProduct}
                  onChange={(value) => setSelectedProduct(value as string)}
                  placeholder={t('ws-invoices.search_products')}
                />
              </div>
              {selectedProduct && (
                <div className="space-y-2">
                  <Label htmlFor="warehouse-select">
                    {t('ws-inventory-warehouses.singular')}
                  </Label>
                  <Select
                    value={selectedWarehouse}
                    onValueChange={setSelectedWarehouse}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t('ws-groups.select_warehouse')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {((warehouses ?? []) as WarehouseOption[]).map((wh) => (
                        <SelectItem key={wh.id} value={wh.id}>
                          {wh.name ||
                            t('ws-inventory-warehouses.unnamed_warehouse')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {selectedProduct && selectedWarehouse && (
                <div className="space-y-2">
                  <Label htmlFor="unit-select">
                    {t('ws-inventory-units.singular')}
                  </Label>
                  <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('ws-groups.select_unit')} />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableUnits(
                        selectedProduct,
                        selectedWarehouse
                      ).map((inventory) => (
                        <SelectItem
                          key={inventory.unit_id}
                          value={inventory.unit_id}
                        >
                          {inventory.inventory_units?.name ||
                            t('ws-inventory-units.unnamed_unit')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                disabled={loading}
              >
                {t('ws-settings.cancel')}
              </Button>
              <Button
                onClick={handleAddProduct}
                disabled={
                  loading ||
                  !selectedProduct ||
                  !selectedWarehouse ||
                  !selectedUnit
                }
              >
                {loading ? t('ws-groups.linking') : t('ws-groups.link_product')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {count > 0 ? (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {linkedProducts.map((product) => {
            const missingWarehouse = !product.warehouse_id;
            const missingUnit = !product.unit_id;
            const hasMissing = missingWarehouse || missingUnit;
            const warehouseName = getWarehouseName(product.warehouse_id);
            const unitName = getUnitName(
              product.id,
              product.warehouse_id,
              product.unit_id
            );
            return (
              <div
                key={product.id}
                className="group flex items-center justify-between rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 md:p-6 transition-all duration-200 hover:shadow-lg hover:shadow-black/5 hover:border-border hover:bg-card/80"
              >
                <div className="flex items-center space-x-4">
                  {/* <div className="flex-shrink-0 rounded-lg bg-primary/10 p-2.5 group-hover:bg-primary/15 transition-colors">
                                        <Box className="h-6 w-6 text-primary" />
                                    </div> */}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-lg text-foreground mb-1">
                      {product.name}
                    </div>
                    {product.description && (
                      <div className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {product.description}
                      </div>
                    )}
                    {hasMissing && (
                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-destructive/10 text-xs font-medium text-destructive">
                        <AlertCircle className="h-3 w-3" />
                        {missingWarehouse && t('ws-groups.missing_warehouse')}
                        {missingWarehouse && missingUnit ? ' • ' : ''}
                        {missingUnit && t('ws-groups.missing_unit')}
                      </div>
                    )}
                    {!hasMissing && (warehouseName || unitName) && (
                      <div className="flex justify-center gap-2 text-xs text-muted-foreground flex-col">
                        {warehouseName && (
                          <div className="flex items-center gap-1.5">
                            <Warehouse className="h-3.5 w-3.5" />
                            <span className="sr-only">
                              {t('ws-inventory-warehouses.singular')}
                            </span>
                            <span className="font-medium">{warehouseName}</span>
                          </div>
                        )}
                        {unitName && (
                          <div className="flex items-center gap-1.5">
                            <RulerDimensionLine className="h-3.5 w-3.5" />
                            <span className="sr-only">
                              {t('ws-inventory-units.singular')}
                            </span>
                            <span className="font-medium">{unitName}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-60 group-hover:opacity-100 transition-opacity hover:bg-muted/80"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={() => openEditDialog(product)}
                      className="cursor-pointer"
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      {t('ws-groups.edit_product')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setDeletingProduct(product);
                        setIsDeleteDialogOpen(true);
                      }}
                      className="text-dynamic-red cursor-pointer"
                    >
                      <Trash2 className="mr-2 h-4 w-4 text-dynamic-red" />
                      {t('ws-groups.remove_product')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Box className="mb-4 h-12 w-12 text-muted-foreground" />
          <div className="font-medium text-muted-foreground">
            {t('ws-groups.no_linked_products')}
          </div>
          <div className="text-sm text-muted-foreground">
            {t('ws-groups.add_products_to_link')}
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ws-groups.remove_linked_product')}</DialogTitle>
            <DialogDescription>
              {t('ws-groups.confirm_remove_product', {
                productName: deletingProduct?.name ?? 'this product',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={loading}
            >
              {t('ws-settings.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteProduct}
              disabled={loading}
            >
              {loading ? t('ws-groups.removing') : t('ws-groups.remove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Linked Product Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent onWheel={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t('ws-groups.edit_linked_product')}</DialogTitle>
            <DialogDescription>
              {t('ws-groups.update_warehouse_and_unit')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('ws-inventory-products.singular')}</Label>
              <div className="text-sm">{editingProduct?.name}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-warehouse-select">
                {t('ws-inventory-warehouses.singular')}
              </Label>
              <Select
                value={selectedWarehouse}
                onValueChange={setSelectedWarehouse}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('ws-groups.select_warehouse')} />
                </SelectTrigger>
                <SelectContent>
                  {((warehouses ?? []) as WarehouseOption[]).map((wh) => (
                    <SelectItem key={wh.id} value={wh.id}>
                      {wh.name ||
                        t('ws-inventory-warehouses.unnamed_warehouse')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedWarehouse && editingProduct && (
              <div className="space-y-2">
                <Label htmlFor="edit-unit-select">
                  {t('ws-inventory-units.singular')}
                </Label>
                <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('ws-groups.select_unit')} />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableUnits(
                      editingProduct.id,
                      selectedWarehouse
                    ).map((inventory) => (
                      <SelectItem
                        key={inventory.unit_id}
                        value={inventory.unit_id}
                      >
                        {inventory.inventory_units?.name ||
                          t('ws-inventory-units.unnamed_unit')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={loading}
            >
              {t('ws-settings.cancel')}
            </Button>
            <Button
              onClick={handleEditProduct}
              disabled={loading || !selectedWarehouse || !selectedUnit}
            >
              {loading ? t('ws-groups.saving') : t('ws-groups.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
