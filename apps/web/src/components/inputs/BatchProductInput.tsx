import { TrashIcon } from '@heroicons/react/24/solid';
import { Divider, NumberInput } from '@mantine/core';
import { Product } from '../../types/primitives/Product';
import ProductSelector from '../selectors/ProductSelector';
import WarehouseSelector from '../selectors/WarehouseSelector';
import UnitSelector from '../selectors/UnitSelector';

interface Props {
  product: Product;
  isLast: boolean;

  getUniqueProductIds: () => string[];
  updateProductId: (id: string, oldId?: string) => void;
  updateAmount: (id: string, amount: number | '') => void;
  updatePrice: (id: string, price: number | '') => void;
  removePrice: () => void;
}

const BatchProductInput = ({
  product,
  isLast,
  getUniqueProductIds,
  updateProductId,
  updateAmount,
  updatePrice,
  removePrice,
}: Props) => {
  return (
    <div className="grid items-end gap-2 xl:grid-cols-2">
      <div className="flex w-full items-end gap-2">
        <ProductSelector
          productId={product.id}
          setProductId={(id) =>
            updateProductId(
              id,
              product.id && product.unit_id
                ? `${product.id}::${product.unit_id}`
                : undefined
            )
          }
          //   id={`${product.id}::${product.unit_id}`}
          //   setId={(id) =>
          //     updateProductId(
          //       id,
          //       product.id && product.unit_id
          //         ? `${product.id}::${product.unit_id}`
          //         : undefined
          //     )
          //   }
          blacklist={getUniqueProductIds()}
          className="w-full"
        />
        <WarehouseSelector
          warehouseId={product.warehouse_id}
          //   id={`${product.id}::${product.unit_id}`}
          //   setId={(id) =>
          //     updateProductId(
          //       id,
          //       product.id && product.unit_id
          //         ? `${product.id}::${product.unit_id}`
          //         : undefined
          //     )
          //   }
          className="w-full"
        />
        <UnitSelector unitId={product.unit_id} className="w-full" />
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
              ? updateAmount(`${product.id}::${product.unit_id}`, val)
              : undefined
          }
          className="w-full"
          classNames={{
            input: 'bg-white/5 border-zinc-300/20 font-semibold',
          }}
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
              ? updatePrice(`${product.id}::${product.unit_id}`, val)
              : undefined
          }
          className="w-full"
          classNames={{
            input: 'bg-white/5 border-zinc-300/20 font-semibold',
          }}
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
