import { TrashIcon } from '@heroicons/react/24/solid';
import { Divider, NumberInput } from '@mantine/core';
import { Product } from '../../types/primitives/Product';
import ProductUnitSelector from '../selectors/ProductUnitSelector';

interface Props {
  warehouseId: string;
  product: Product;
  isLast: boolean;

  getUniqueUnitIds: () => string[];
  updateProduct: (product: Product) => void;
  removePrice: () => void;
}

const BatchProductInput = ({
  warehouseId,
  product,
  isLast,
  getUniqueUnitIds,
  updateProduct,
  removePrice,
}: Props) => {
  return (
    <div className="grid items-end gap-2 xl:grid-cols-2">
      <div className="flex w-full items-end gap-2">
        <ProductUnitSelector
          warehouseId={warehouseId}
          product={product}
          setProduct={(p) =>
            updateProduct({
              ...product,
              ...p,
            })
          }
          blacklist={getUniqueUnitIds()}
          className="w-full"
        />
        <button
          className="h-fit rounded border border-red-300/10 bg-red-300/10 px-1 py-1.5 font-semibold text-red-300 transition hover:bg-red-300/20 md:px-4 xl:hidden"
          onClick={removePrice}
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex w-full items-end gap-2">
        <NumberInput
          label="Số lượng"
          placeholder="Số lượng nhập"
          value={product.amount}
          onChange={(val) =>
            product.id && product.unit_id
              ? updateProduct({
                  ...product,
                  amount: val,
                })
              : undefined
          }
          className="w-full"
          min={0}
          parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
          formatter={(value) =>
            !Number.isNaN(parseFloat(value || ''))
              ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
              : ''
          }
          disabled={!product.id || !product.unit_id}
        />
        <NumberInput
          label="Giá nhập"
          placeholder="Giá nhập sản phẩm"
          value={product.price}
          onChange={(val) =>
            product.id && product.unit_id
              ? updateProduct({
                  ...product,
                  price: val,
                })
              : undefined
          }
          className="w-full"
          min={0}
          parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
          formatter={(value) =>
            !Number.isNaN(parseFloat(value || ''))
              ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
              : ''
          }
          disabled={!product.id || !product.unit_id}
        />
        <button
          className="pointer-events-none h-fit rounded border border-red-300/10 bg-red-300/10 px-1 py-1.5 font-semibold text-red-300 opacity-0 transition hover:bg-red-300/20 md:px-4 xl:pointer-events-auto xl:opacity-100"
          onClick={removePrice}
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>
      {isLast || <Divider className="mt-2 w-full xl:hidden" />}
    </div>
  );
};

export default BatchProductInput;
