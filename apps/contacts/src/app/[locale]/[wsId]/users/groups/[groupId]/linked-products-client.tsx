'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Link } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  GroupSectionCard,
  GroupSectionEmpty,
} from './_components/group-section-card';
import { LinkedProductItem } from './linked-product-item';
import {
  LinkedProductAddDialog,
  LinkedProductDeleteDialog,
  LinkedProductEditDialog,
} from './linked-products-dialogs';
import {
  getUnitName,
  getWarehouseName,
  type LinkedProduct,
  useProducts,
  useWarehouses,
} from './use-linked-products';

interface LinkedProductsClientProps {
  wsId: string;
  groupId: string;
  canUpdateLinkedProducts: boolean;
  initialLinkedProducts?: { items: LinkedProduct[]; count: number };
}

type LinkedProductsCache = { items: LinkedProduct[]; count: number };

export default function LinkedProductsClient({
  wsId,
  groupId,
  canUpdateLinkedProducts,
  initialLinkedProducts,
}: LinkedProductsClientProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const linkedProductsQueryKey = ['linked-products', wsId, groupId] as const;
  const { data: linkedProductsData } = useQuery({
    queryKey: linkedProductsQueryKey,
    enabled: Boolean(wsId && groupId),
    initialData: initialLinkedProducts,
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/linked-products`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        throw new Error('Failed to fetch linked products');
      }
      return (await response.json()) as LinkedProductsCache;
    },
    staleTime: 30 * 1000,
  });

  const linkedProducts = linkedProductsData?.items ?? [];
  const count = linkedProductsData?.count ?? 0;

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<LinkedProduct | null>(
    null
  );
  const [editingProduct, setEditingProduct] = useState<LinkedProduct | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  const { data: workspaceProducts } = useProducts(wsId);
  const { data: warehouses } = useWarehouses(
    wsId,
    isAddDialogOpen || isEditDialogOpen
  );

  const addLinkedProductMutation = useMutation({
    mutationFn: async ({
      productId,
      warehouseId,
      unitId,
    }: {
      productId: string;
      warehouseId: string;
      unitId: string;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/linked-products`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, warehouseId, unitId }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to add linked product');
      }
      const matched = (workspaceProducts ?? []).find((p) => p.id === productId);
      return {
        id: productId,
        name: matched?.name ?? null,
        description: matched?.description ?? null,
        warehouse_id: warehouseId,
        unit_id: unitId,
      } satisfies LinkedProduct;
    },
    onSuccess: (newLinked) => {
      queryClient.setQueryData(
        linkedProductsQueryKey,
        (prev: LinkedProductsCache | undefined) =>
          prev
            ? { items: [...prev.items, newLinked], count: prev.count + 1 }
            : { items: [newLinked], count: 1 }
      );
      setIsAddDialogOpen(false);
      toast(t('ws-groups.linked_product_added_successfully'));
      queryClient.invalidateQueries({ queryKey: ['products', wsId] });
    },
    onError: (error: unknown) => {
      toast(
        error instanceof Error
          ? error.message
          : t('ws-groups.failed_to_add_linked_product')
      );
    },
  });

  const deleteLinkedProductMutation = useMutation({
    mutationFn: async ({ productId }: { productId: string }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/linked-products/${productId}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to delete linked product');
      }
      return { productId };
    },
    onSuccess: ({ productId }) => {
      queryClient.setQueryData(
        linkedProductsQueryKey,
        (prev: LinkedProductsCache | undefined) =>
          prev
            ? {
                items: prev.items.filter((p) => p.id !== productId),
                count: Math.max(0, prev.count - 1),
              }
            : prev
      );
      setIsDeleteDialogOpen(false);
      setDeletingProduct(null);
      toast(t('ws-groups.linked_product_removed_successfully'));
      queryClient.invalidateQueries({ queryKey: ['products', wsId] });
    },
    onError: (error: unknown) => {
      toast(
        error instanceof Error
          ? error.message
          : t('ws-groups.failed_to_delete_linked_product')
      );
    },
  });

  const updateLinkedProductMutation = useMutation({
    mutationFn: async ({
      productId,
      warehouseId,
      unitId,
    }: {
      productId: string;
      warehouseId: string;
      unitId: string;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/linked-products/${productId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ warehouseId, unitId }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update linked product');
      }
      return { productId, warehouseId, unitId };
    },
    onSuccess: ({ productId, warehouseId, unitId }) => {
      queryClient.setQueryData(
        linkedProductsQueryKey,
        (prev: LinkedProductsCache | undefined) =>
          prev
            ? {
                items: prev.items.map((p) =>
                  p.id === productId
                    ? { ...p, warehouse_id: warehouseId, unit_id: unitId }
                    : p
                ),
                count: prev.count,
              }
            : prev
      );
      setIsEditDialogOpen(false);
      setEditingProduct(null);
      toast(t('ws-groups.linked_product_updated_successfully'));
      queryClient.invalidateQueries({ queryKey: ['products', wsId] });
    },
    onError: (error: unknown) => {
      toast(
        error instanceof Error
          ? error.message
          : t('ws-groups.failed_to_update_linked_product')
      );
    },
  });

  const runMutation = async (promise: Promise<unknown>) => {
    setLoading(true);
    try {
      await promise;
    } catch {
      // surfaced via mutation onError
    } finally {
      setLoading(false);
    }
  };

  return (
    <GroupSectionCard
      accent="purple"
      icon={<Link className="h-5 w-5" />}
      title={t('user-data-table.linked_products')}
      description={count ? `${count}` : undefined}
      action={
        canUpdateLinkedProducts ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddDialogOpen(true)}
          >
            <Link className="mr-2 h-4 w-4" />
            {t('user-data-table.link_product')}
          </Button>
        ) : undefined
      }
    >
      {count > 0 ? (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {linkedProducts.map((product) => (
            <LinkedProductItem
              key={product.id}
              product={product}
              warehouseName={getWarehouseName(
                workspaceProducts,
                warehouses,
                product.id,
                product.warehouse_id
              )}
              unitName={getUnitName(
                workspaceProducts,
                product.id,
                product.warehouse_id,
                product.unit_id
              )}
              canUpdate={canUpdateLinkedProducts}
              onEdit={(p) => {
                setEditingProduct(p);
                setIsEditDialogOpen(true);
              }}
              onDelete={(p) => {
                setDeletingProduct(p);
                setIsDeleteDialogOpen(true);
              }}
            />
          ))}
        </div>
      ) : (
        <GroupSectionEmpty icon={<Box className="h-8 w-8" />}>
          <div className="font-medium text-muted-foreground">
            {t('ws-groups.no_linked_products')}
          </div>
          <div className="text-muted-foreground text-sm">
            {t('ws-groups.add_products_to_link')}
          </div>
        </GroupSectionEmpty>
      )}

      {canUpdateLinkedProducts && (
        <>
          <LinkedProductAddDialog
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            products={workspaceProducts}
            warehouses={warehouses}
            linkedProducts={linkedProducts}
            loading={loading}
            onSubmit={(productId, warehouseId, unitId) =>
              runMutation(
                addLinkedProductMutation.mutateAsync({
                  productId,
                  warehouseId,
                  unitId,
                })
              )
            }
          />
          <LinkedProductEditDialog
            open={isEditDialogOpen}
            onOpenChange={(open) => {
              setIsEditDialogOpen(open);
              if (!open) setEditingProduct(null);
            }}
            product={editingProduct}
            products={workspaceProducts}
            warehouses={warehouses}
            loading={loading}
            onSubmit={(productId, warehouseId, unitId) =>
              runMutation(
                updateLinkedProductMutation.mutateAsync({
                  productId,
                  warehouseId,
                  unitId,
                })
              )
            }
          />
          <LinkedProductDeleteDialog
            open={isDeleteDialogOpen}
            onOpenChange={(open) => {
              setIsDeleteDialogOpen(open);
              if (!open) setDeletingProduct(null);
            }}
            product={deletingProduct}
            loading={loading}
            onConfirm={() => {
              if (deletingProduct) {
                runMutation(
                  deleteLinkedProductMutation.mutateAsync({
                    productId: deletingProduct.id,
                  })
                );
              }
            }}
          />
        </>
      )}
    </GroupSectionCard>
  );
}
