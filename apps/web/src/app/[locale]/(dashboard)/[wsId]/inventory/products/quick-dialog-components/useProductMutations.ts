import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface UpdateProductParams {
  wsId: string;
  productId: string;
  payload: any;
}

interface UpdateInventoryParams {
  wsId: string;
  productId: string;
  inventory: any[];
}

interface DeleteProductParams {
  wsId: string;
  productId: string;
}

export function useProductMutations() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const t = useTranslations();

  const updateProductMutation = useMutation({
    mutationFn: async ({ wsId, productId, payload }: UpdateProductParams) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/products/${productId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        throw new Error(
          t('ws-inventory-products.messages.failed_update_details')
        );
      }

      return res.json();
    },
    onSuccess: (_, { wsId, productId }) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-products', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['workspace-product', wsId, productId],
      });
      router.refresh();
    },
  });

  const updateInventoryMutation = useMutation({
    mutationFn: async ({
      wsId,
      productId,
      inventory,
    }: UpdateInventoryParams) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/products/${productId}/inventory`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inventory }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to update product inventory: ${errText}`);
      }

      return res.json();
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
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/products/${productId}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(
          data.message ||
            t('ws-inventory-products.messages.failed_delete_product')
        );
      }

      return res.json();
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
