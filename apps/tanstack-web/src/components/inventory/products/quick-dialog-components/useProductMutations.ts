import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteInventoryProduct,
  type InventoryProductInventoryPayload,
  type InventoryProductPayload,
  updateInventoryProduct,
  updateInventoryProductInventory,
} from '@tuturuuu/internal-api';
import type { Product } from '@tuturuuu/types/primitives/Product';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useRouter } from '../../../../lib/platform/next-navigation-shim';

interface UpdateProductParams {
  wsId: string;
  productId: string;
  payload: Partial<Product>;
}

interface UpdateInventoryParams {
  wsId: string;
  productId: string;
  inventory: NonNullable<Product['inventory']>;
}

interface DeleteProductParams {
  wsId: string;
  productId: string;
}

export function useProductMutations() {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const router = useRouter();

  const updateProductMutation = useMutation({
    mutationFn: async ({ wsId, productId, payload }: UpdateProductParams) => {
      try {
        return await updateInventoryProduct(
          wsId,
          productId,
          payload as Partial<InventoryProductPayload>
        );
      } catch (_error) {
        throw new Error(
          t('ws-inventory-products.messages.failed_update_details')
        );
      }
    },
    onSuccess: (_, { wsId, productId }) => {
      toast.success(
        t('ws-inventory-products.messages.product_updated_successfully')
      );
      queryClient.invalidateQueries({ queryKey: ['workspace-products', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['workspace-product', wsId, productId],
      });
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateInventoryMutation = useMutation({
    mutationFn: async ({
      wsId,
      productId,
      inventory,
    }: UpdateInventoryParams) => {
      try {
        return await updateInventoryProductInventory(wsId, productId, {
          inventory: inventory as InventoryProductInventoryPayload['inventory'],
        });
      } catch (error) {
        throw new Error(
          `Failed to update product inventory: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    },
    onSuccess: (_, { wsId, productId }) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-products', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['workspace-product', wsId, productId],
      });
      router.refresh();
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async ({ wsId, productId }: DeleteProductParams) => {
      try {
        return await deleteInventoryProduct(wsId, productId);
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : t('ws-inventory-products.messages.failed_delete_product')
        );
      }
    },
    onSuccess: (_, { wsId, productId }) => {
      toast.success(
        t('ws-inventory-products.messages.product_deleted_successfully')
      );
      queryClient.invalidateQueries({ queryKey: ['workspace-products', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['workspace-product', wsId, productId],
      });
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return {
    updateProductMutation,
    updateInventoryMutation,
    deleteProductMutation,
  };
}
