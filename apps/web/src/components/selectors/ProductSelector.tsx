import { Select } from '@mantine/core';
import { Product } from '../../types/primitives/Product';
import useSWR from 'swr';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useEffect } from 'react';

interface Props {
  productId: string;
  setProductIdAndCategoryId: (productId: string, categoryId: string) => void;

  warehouseId?: string;
  blacklist?: string[];

  required?: boolean;
  className?: string;
}

const ProductSelector = ({
  productId,
  setProductIdAndCategoryId,
  warehouseId,
  blacklist,

  required = false,
  className,
}: Props) => {
  const { ws } = useWorkspaces();

  const handleProductChange = (selectedValue: string) => {
    const selectedProduct = data.find((item) => item.value === selectedValue);
    if (selectedProduct && selectedProduct.categoryId) {
      const { categoryId } = selectedProduct;
      setProductIdAndCategoryId(selectedValue, categoryId);
    }
  };

  const apiPath = `/api/workspaces/${ws?.id}/inventory/products?unique=true&warehouse_id=${warehouseId}`;

  const { data: products } = useSWR<{ data: Product[]; count: number }>(
    ws?.id ? apiPath : null
  );


  const data = [
    ...(products?.data.map((product) => ({
      label: product.name,
      value: product.id,
      categoryId: product.category_id,
      disabled: blacklist?.includes(product.id),
    })) || []),
  ];

  return (
    <Select
      label="Sản phẩm"
      placeholder={
        products && products.data.length === 0
          ? 'Chưa có sản phẩm nào'
          : 'Chọn sản phẩm'
      }
      data={data}
      value={productId}
      onChange={handleProductChange}
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
