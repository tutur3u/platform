import { TrashIcon } from '@heroicons/react/24/solid';
import { Product } from '@/types/primitives/Product';
import { NumberInput } from '@mantine/core';
import { useEffect } from 'react';
import SettingItemCard from '../settings/SettingItemCard';
import ProductSelector from '../selectors/ProductSelector';
import UnitSelector from '../selectors/UnitSelector';
import WarehouseSelector from '../selectors/WarehouseSelector';
import useTranslation from 'next-translate/useTranslation';

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

  getUniqueWarehouseIds,
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
            }).format(Number(p?.price * (p?.amount || 0)))
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
          <ProductSelector
            productId={p.id}
            setProductId={(id) =>
              updateProduct({
                ...p,
                id,
                unit_id: '',
                warehouse_id: '',
                price: '',
                stock: '',
                amount: '',
              })
            }
          />

          <UnitSelector
            unitId={p.unit_id}
            setUnitId={(id) =>
              updateProduct({
                ...p,
                unit_id: id,
                warehouse_id: '',
                price: '',
                stock: '',
                amount: '',
              })
            }
            customApiPath={
              p.id
                ? `/api/workspaces/${wsId}/inventory/products/${p.id}/units`
                : null
            }
            creatable={false}
            disabled={!p.id}
          />

          <WarehouseSelector
            warehouseId={p.warehouse_id}
            setWarehouseId={(id) =>
              updateProduct({
                ...p,
                warehouse_id: id,
                price: '',
                stock: '',
                amount: '',
              })
            }
            customApiPath={
              p.id && p.unit_id
                ? `/api/workspaces/${wsId}/inventory/products/${p.id}/units/${
                    p.unit_id
                  }/warehouses?blacklist=${getUniqueWarehouseIds().join(',')}`
                : null
            }
            creatable={false}
            disabled={!p.id || !p.unit_id}
          />

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
                  parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
                  formatter={(value) =>
                    !Number.isNaN(parseFloat(value || ''))
                      ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                      : ''
                  }
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
                parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
                formatter={(value) =>
                  !Number.isNaN(parseFloat(value || ''))
                    ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                    : ''
                }
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
                parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
                formatter={(value) =>
                  !Number.isNaN(parseFloat(value || ''))
                    ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                    : ''
                }
                disabled={p.stock === null || p?.stock === 0}
                max={hideStock ? undefined : p.stock || 0}
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
