import { Select } from '@mantine/core';
import { Product } from '../../types/primitives/Product';
import useSWR from 'swr';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface Props {
  warehouseId: string;
  product: Product | null;

  setProduct: (product: Product | null) => void;

  blacklist?: string[];

  required?: boolean;
  className?: string;
}

const ProductUnitSelector = ({
  warehouseId,
  product,

  setProduct,

  blacklist,

  required = false,
  className,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/inventory/products?hasUnit=true&warehouseIds=${warehouseId}`;

  const { data: products } = useSWR<{ data: Product[]; count: number }>(
    ws?.id ? apiPath : null
  );

  const data = [
    ...(products?.data?.map((p) => ({
      label: `[${p.unit || 'Chưa có đơn vị'}] ${p.name}`,
      value: `${p.id}::${p.unit_id}`,
      disabled: blacklist?.includes(`${p.id}::${p.unit_id}`),
    })) || []),
  ];

  return (
    <Select
      label="Sản phẩm"
      placeholder={
        products && products?.data?.length === 0
          ? 'Chưa có sản phẩm nào'
          : 'Chọn sản phẩm'
      }
      data={data}
      value={`${product?.id}::${product?.unit_id}`}
      onChange={(value) => {
        if (!value) {
          setProduct(null);
          return;
        }

        const [id, unitId] = value.split('::');

        setProduct({
          id,
          unit_id: unitId,
        });
      }}
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

export default ProductUnitSelector;
