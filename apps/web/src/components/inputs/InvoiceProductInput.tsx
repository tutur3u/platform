import SettingItemCard from '../settings/SettingItemCard';
import { Product } from '@/types/primitives/Product';
import { TrashIcon } from '@heroicons/react/24/solid';
import { NumberInput } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';
import { useEffect } from 'react';

interface Props {
  wsId: string;
  product: Product;
  isLast: boolean;

  getUniqueWarehouseIds: () => string[];
  updateProduct: (product: Product) => void;
  removePrice: () => void;

  hideStock?: boolean;
}

const InvoiceProductInput = ({
  wsId,
  product: p,

  updateProduct,
  removePrice,

  hideStock = false,
}: Props) => {
  useEffect(() => {
    const validProduct = p.id && p.unit_id && p.warehouse_id;
    const hasData =
      p.price !== null && p.price !== '' && p.stock !== null && p.stock !== '';

    if (!validProduct || hideStock) return;
    if (hasData) return;

    fetch(
      `/api/workspaces/${wsId}/inventory/products/${p.id}/warehouses/${p.warehouse_id}/${p.unit_id}`
    )
      .then((res) => res.json())
      .then((product) => {
        const stock = product?.amount;
        const price = product?.price;

        if (price === undefined || stock === undefined) return;

        updateProduct({
          ...p,
          stock,
          price,
          amount: (p?.amount || 1) > stock ? stock : 1,
        });
      });
  }, [wsId, p, hideStock, updateProduct]);

  const { t } = useTranslation('invoice-product-input');

  return (
    <SettingItemCard
      title={
        p?.price != null && p?.price != ''
          ? Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
            }).format(Number(Number(p?.price || 0) * Number(p?.amount || 0)))
          : t('no-price')
      }
      description={
        p?.price != null && p?.price != ''
          ? p?.amount === 0
            ? t('missing-amount')
            : `${Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
              }).format(Number(p.price))} x ${Intl.NumberFormat('vi-VN').format(
                Number(p?.amount || 0)
              )}`
          : t('pending-product-selection-and-amount')
      }
    >
      <div className="flex gap-2">
        <div className="grid w-full gap-2 xl:grid-cols-3">
          {p?.warehouse_id === undefined || p?.warehouse_id === '' ? (
            <div className="col-span-full rounded border border-orange-500/20 bg-orange-500/10 p-4 text-center font-semibold text-orange-600 dark:border-orange-300/20 dark:bg-orange-300/10 dark:text-orange-300">
              {t('pending-data')}
            </div>
          ) : p?.price === '' || p?.stock === '' ? (
            <div className="col-span-full rounded border border-orange-500/20 bg-orange-500/10 p-4 text-center font-semibold text-orange-600 dark:border-orange-300/20 dark:bg-orange-300/10 dark:text-orange-300">
              {t('loading-data')}
            </div>
          ) : p?.stock === 0 ? (
            <div className="col-span-full rounded border border-red-500/20 bg-red-500/10 p-4 text-center font-semibold text-red-600 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300">
              {t('product-out-of-stock')}
            </div>
          ) : (
            <>
              {hideStock || (
                <NumberInput
                  label={t('in-stock')}
                  placeholder={
                    p.warehouse_id
                      ? t('common:loading')
                      : t('pending-product-selection')
                  }
                  value={p.stock}
                  min={0}
                  disabled
                />
              )}

              <NumberInput
                label={t('price')}
                placeholder={
                  p.warehouse_id
                    ? t('common:loading')
                    : t('pending-product-selection')
                }
                value={p.price}
                min={0}
                disabled
              />

              <NumberInput
                label={t('amount')}
                placeholder={
                  p?.stock && p?.price
                    ? t('amount-placeholder')
                    : p.warehouse_id
                      ? t('pending-amount-loaded')
                      : t('pending-product-selection')
                }
                value={p.amount}
                onChange={(val) =>
                  p.id && p.unit_id
                    ? updateProduct({ ...p, amount: val })
                    : undefined
                }
                min={0}
                disabled={p.stock === null || p?.stock === 0}
                className={hideStock ? 'xl:col-span-2' : ''}
              />
            </>
          )}
        </div>

        <button
          className="mt-[1.6125rem] h-fit rounded border border-red-500/10 bg-red-500/10 px-1 py-1.5 font-semibold text-red-600 transition hover:bg-red-500/20 md:px-4 dark:border-red-300/10 dark:bg-red-300/10 dark:text-red-300 dark:hover:bg-red-300/20"
          onClick={removePrice}
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>
    </SettingItemCard>
  );
};

export default InvoiceProductInput;
