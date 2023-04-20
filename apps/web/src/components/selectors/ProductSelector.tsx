import { Select } from '@mantine/core';
import { Product } from '../../types/primitives/Product';
import useSWR from 'swr';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface Props {
  productId: string;
  setProductId: (productId: string) => void;

  warehouseId?: string;
  blacklist?: string[];

  required?: boolean;
  className?: string;
}

const ProductSelector = ({
  productId,
  setProductId,

  warehouseId,
  blacklist,

  required = false,
  className,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/inventory/products?unique=true&warehouse_id=${warehouseId}`;
  const { data: products } = useSWR<Product[]>(ws?.id ? apiPath : null);

  const data = [
    ...(products?.map((product) => ({
      label: product.name,
      value: product.id,
      disabled: blacklist?.includes(product.id),
    })) || []),
  ];

  return (
    <Select
      label="Sản phẩm"
      placeholder={
        products && products.length === 0
          ? 'Chưa có sản phẩm nào'
          : 'Chọn sản phẩm'
      }
      data={data}
      value={productId}
      onChange={setProductId}
      className={className}
      styles={{
        item: {
          // applies styles to selected item
          '&[data-selected]': {
            '&, &:hover': {
              backgroundColor: '#6b686b',
              color: '#fff',
              fontWeight: 600,
            },
          },

          // applies styles to hovered item
          '&:hover': {
            backgroundColor: '#454345',
            color: '#fff',
          },
        },
      }}
      disabled={!products}
      searchable
      required={required}
    />
  );
};

export default ProductSelector;
