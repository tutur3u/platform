import { Select } from '@mantine/core';
import { Product } from '../../types/primitives/Product';
import useSWR from 'swr';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface Props {
  productId: string;
  setProductId: (productId: string) => void;
  blacklist?: string[];

  required?: boolean;
  className?: string;
}

const ProductSelector = ({
  productId,
  setProductId,
  blacklist,

  required = false,
  className,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/inventory/products?unique=true`;
  const { data: products } = useSWR<Product[]>(ws?.id ? apiPath : null);

  const data = [
    ...(products?.map((product) => ({
      label: product.name,
      value: product.id,
      disabled: blacklist?.includes(product.id) || !product.unit,
    })) || []),
  ];

  return (
    <Select
      label="Sản phẩm"
      placeholder="Chọn sản phẩm"
      data={data}
      value={productId}
      onChange={setProductId}
      className={className}
      classNames={{
        input:
          'bg-[#3f3a3a]/30 border-zinc-300/20 focus:border-zinc-300/20 border-zinc-300/20 font-semibold',
        dropdown: 'bg-[#323030]',
      }}
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
