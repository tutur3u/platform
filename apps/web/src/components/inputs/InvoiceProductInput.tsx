import { TrashIcon } from '@heroicons/react/24/solid';
import { Product } from '../../types/primitives/Product';
import ProductUnitSelector from '../selectors/ProductUnitSelector';
import { NumberInput } from '@mantine/core';
import { useEffect, useState } from 'react';
import SettingItemCard from '../settings/SettingItemCard';

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

const InvoiceProductInput = ({
  wsId,
  p,
  idx,
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
          .then((product) => {
            if (product?.price === undefined || !p?.unit_id) return;
            setPrice(product.price);
            updatePrice({
              productId: p.id,
              unitId: p.unit_id,
              price: product.price,
            });
          });
      else setPrice(p.price);
    }
  }, [wsId, p, updatePrice]);

  return (
    <SettingItemCard
      title={
        price != null
          ? Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
            }).format(Number(price * (p?.amount || 0)))
          : 'Chưa có giá'
      }
      description={
        price != null
          ? `${Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
            }).format(Number(price))} x ${Intl.NumberFormat('vi-VN').format(
              Number(p?.amount || 0)
            )}`
          : 'Chờ chọn sản phẩm và nhập số lượng'
      }
    >
      <div className="flex gap-2">
        <div className={`grid w-full gap-2 ${p?.id ? 'xl:grid-cols-2' : ''}`}>
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

          {p?.id && (
            <NumberInput
              label="Số lượng (Tồn kho: 999,999,999,999)"
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
          )}
        </div>

        <button
          className="mt-[1.6125rem] h-fit rounded border border-red-300/10 bg-red-300/10 px-1 py-1.5 font-semibold text-red-300 transition hover:bg-red-300/20 md:px-4"
          onClick={() => removePrice(idx)}
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>
    </SettingItemCard>
  );
};

export default InvoiceProductInput;
