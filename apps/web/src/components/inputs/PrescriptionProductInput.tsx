import { TrashIcon } from '@heroicons/react/24/solid';
import { Product } from '../../types/primitives/Product';
import ProductUnitSelector from '../selectors/ProductUnitSelector';
import { Divider, NumberInput } from '@mantine/core';
import { useEffect, useState } from 'react';

interface Props {
  wsId: string;
  p: Product;
  idx: number;
  isLast: boolean;
  updateProductId: (idx: number, id: string, oldId?: string) => void;
  updateAmount: (id: string, amount: number) => void;
  updatePrice: ({
    productId,
    unitId,
    price,
  }: {
    productId: string;
    unitId: string;
    price: number;
  }) => void;
  removePrice: (idx: number) => void;
  getUniqueProductIds: () => string[];
}

const PrescriptionProductInput = ({
  wsId,
  p,
  idx,
  isLast,
  updateProductId,
  updateAmount,
  updatePrice,
  getUniqueProductIds,
  removePrice,
}: Props) => {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    if (p.id && p.unit_id) {
      if (p?.price === undefined)
        fetch(
          `/api/workspaces/${wsId}/inventory/products/${p.id}/prices/${p.unit_id}`
        )
          .then((res) => res.json())
          .then((data) => {
            if (data?.price === undefined || !p?.unit_id) return;
            setPrice(data.price);
            updatePrice({
              productId: p.id,
              unitId: p.unit_id,
              price: data.price,
            });
          });
      else setPrice(p.price);
    }
  }, [wsId, p.id, p.unit_id, p?.price, updatePrice]);

  return (
    <div className="grid items-end gap-2 xl:grid-cols-2">
      <div className="flex w-full items-end gap-2">
        <ProductUnitSelector
          id={`${p.id}::${p.unit_id}`}
          setId={(id) =>
            updateProductId(
              idx,
              id,
              p.id && p.unit_id ? `${p.id}::${p.unit_id}` : undefined
            )
          }
          blacklist={getUniqueProductIds()}
          className="w-full"
        />
        <button
          className="h-fit rounded border border-red-300/10 bg-red-300/10 px-1 py-1.5 font-semibold text-red-300 transition hover:bg-red-300/20 md:px-4 xl:hidden"
          onClick={() => removePrice(idx)}
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex w-full items-end gap-2">
        <NumberInput
          label="Số lượng"
          placeholder="Số lượng"
          value={p.amount}
          onChange={(e) =>
            p.id && p.unit_id
              ? updateAmount(`${p.id}::${p.unit_id}`, Number(e))
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
          disabled={!p.id || !p.unit_id}
        />

        {price != null ? (
          <NumberInput
            label="Giá bán"
            value={price * (p?.amount || 0)}
            className="w-full"
            classNames={{
              input: 'bg-white/5 border-zinc-300/20 font-semibold',
            }}
            min={0}
            parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
            formatter={(value) =>
              !Number.isNaN(parseFloat(value || ''))
                ? Intl.NumberFormat('vi-VN', {
                    style: 'currency',
                    currency: 'VND',
                  }).format(Number(value || '')) || ''
                : ''
            }
            disabled
          />
        ) : null}

        <button
          className="pointer-events-none h-fit rounded border border-red-300/10 bg-red-300/10 px-1 py-1.5 font-semibold text-red-300 opacity-0 transition hover:bg-red-300/20 md:px-4 xl:pointer-events-auto xl:opacity-100"
          onClick={() => removePrice(idx)}
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>
      {isLast || <Divider className="mt-2 w-full xl:hidden" />}
    </div>
  );
};

export default PrescriptionProductInput;
