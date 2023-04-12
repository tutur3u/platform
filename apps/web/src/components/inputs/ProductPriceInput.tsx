import { Divider, NumberInput } from '@mantine/core';
import UnitSelector from '../selectors/UnitSelector';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { ProductPrice } from '../../types/primitives/ProductPrice';

interface Props {
  price: ProductPrice;
  minAmount: number | '';
  isLast: boolean;

  updatePrice: (unitId: string, price: number | '') => void;
  updateMinAmount: (unitId: string, amount: number | '') => void;

  updateUnitId: (unitId: string, oldUnitId: string) => void;
  removePrice: () => void;
  getUniqueUnitIds: () => string[];
}

const ProductPriceInput = ({
  price,
  minAmount,
  isLast,

  updatePrice,
  updateMinAmount,
  updateUnitId,
  removePrice,
  getUniqueUnitIds,
}: Props) => {
  return (
    <div className="flex gap-2">
      <div className="grid w-full gap-2 md:grid-cols-2 2xl:grid-cols-4">
        <UnitSelector
          unitId={price.unit_id}
          setUnitId={(id) => updateUnitId(id, price.unit_id)}
          blacklist={getUniqueUnitIds()}
          className="w-full"
        />

        <NumberInput
          label="Giá bán"
          placeholder="Nhập giá bán"
          value={price.price ?? ''}
          onChange={(num) =>
            price.unit_id ? updatePrice(price.unit_id, num) : null
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
          disabled={!price.unit_id}
        />
        <NumberInput
          label="Tồn kho tối thiểu"
          placeholder="0"
          value={minAmount || ''}
          onChange={(num) =>
            price.unit_id ? updateMinAmount(price.unit_id, num) : null
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
          disabled={!price.unit_id}
        />

        <NumberInput
          label="Tồn kho"
          placeholder="Đang tải..."
          value={0}
          onChange={(num) =>
            price.unit_id ? updatePrice(price.unit_id, num) : null
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
          disabled
        />

        {isLast || <Divider className="col-span-full mt-2" />}
      </div>
      <button
        className="mt-[1.6125rem] flex h-fit w-fit items-center justify-center rounded border border-red-300/10 bg-red-300/10 px-1 py-1.5 font-semibold text-red-300 transition hover:bg-red-300/20 md:px-4"
        onClick={removePrice}
      >
        <XMarkIcon className="h-5 w-5" />
      </button>
    </div>
  );
};

export default ProductPriceInput;
