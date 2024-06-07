import ProductPriceInput from './ProductPriceInput';
import { ProductPrice } from '@/types/primitives/ProductPrice';
import { ProductWarehouse } from '@/types/primitives/ProductWarehouse';
import { Divider } from '@mantine/core';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

interface Props {
  wsId: string;
  productId?: string;
  warehouse: ProductWarehouse;
}

const WarehouseProductsInput = ({ wsId, productId, warehouse }: Props) => {
  const pricesApiPath =
    wsId && productId
      ? `/api/workspaces/${wsId}/inventory/products/${productId}/warehouses/${warehouse.id}`
      : null;

  const { data: productPrices } = useSWR<ProductPrice[]>(pricesApiPath);
  const [prices, setPrices] = useState<ProductPrice[]>([]);

  const [pricesChanged, setPricesChanged] = useState(false);

  useEffect(() => {
    if (productPrices) setPrices(productPrices);
  }, [productPrices, setPrices]);

  const resetPrices = () => {
    setPrices(productPrices ?? []);
    setPricesChanged(false);
  };

  const allPricesValid = () =>
    prices.every((p) => p.unit_id.length > 0 && typeof p.price === 'number');

  const hasRequiredFields = () =>
    allPricesValid() && productPrices !== undefined;

  const addEmptyPrice = () => {
    const newPrice = {
      warehouse_id: warehouse.id,
      product_id: '',
      unit_id: '',
      price: null,
      amount: 0,
    };

    if (!pricesChanged) setPricesChanged(true);
    setPrices((prices) => [...prices, newPrice]);
  };

  const updateUnitId = (index: number, newId: string, id?: string) => {
    if (newId === id) return;

    if (prices.some((price) => price.unit_id === newId)) return;

    // If the id is provided, it means that the user is changing the id
    // of an existing price. In this case, we need to find the index of the
    // price with the old id and replace it with the new one.
    if (id) {
      const oldIndex = prices.findIndex((price) => price.unit_id === id);

      if (oldIndex === -1) return;

      setPrices((prices) => {
        const newPrices = [...prices];
        newPrices[oldIndex].unit_id = newId;
        return newPrices;
      });
    } else {
      setPrices((prices) => {
        const newPrices = [...prices];
        newPrices[index].unit_id = newId;
        return newPrices;
      });
    }

    setPricesChanged(true);
  };

  const updatePrice = (id: string, price: number | '') => {
    const index = prices.findIndex((price) => price.unit_id === id);

    if (index === -1) return;

    setPrices((prices) => {
      const newPrices = [...prices];
      newPrices[index].price = price === '' ? null : price;
      return newPrices;
    });

    setPricesChanged(true);
  };

  const updateMinAmount = (id: string, amount: number | '') => {
    const index = prices.findIndex((price) => price.unit_id === id);

    if (index === -1) return;

    setPrices((prices) => {
      const newPrices = [...prices];
      newPrices[index].min_amount = amount === '' ? null : amount;
      return newPrices;
    });

    setPricesChanged(true);
  };

  const getUniqueUnitIds = () => {
    const unitIds = new Set<string>();
    prices.forEach((price) => unitIds.add(price.unit_id));
    return Array.from(unitIds);
  };

  const removePrice = (index: number) => {
    setPrices((prices) => prices.filter((_, idx) => idx !== index));

    setPricesChanged(
      !(
        prices.filter((_, idx) => idx !== index).length === 0 &&
        productPrices?.length === 0
      )
    );
  };

  return (
    <div className="border-border rounded border bg-zinc-500/5 p-4 dark:border-zinc-300/10 dark:bg-zinc-900">
      <div className="text-2xl font-semibold">{warehouse.name}</div>
      <Divider className="my-2" variant="dashed" />

      <div className="grid gap-2">
        {prices.map((p, idx) => (
          <ProductPriceInput
            key={p.product_id + p.unit_id + idx}
            price={p}
            minAmount={p?.min_amount || ''}
            getUniqueUnitIds={getUniqueUnitIds}
            removePrice={() => removePrice(idx)}
            updatePrice={(unitId, price) => updatePrice(unitId, Number(price))}
            updateMinAmount={(unitId, amount) =>
              updateMinAmount(unitId, Number(amount))
            }
            updateUnitId={(unitId, oldUnitId) =>
              updateUnitId(idx, unitId, oldUnitId)
            }
            isLast={
              idx ===
              prices.filter((p) => p.warehouse_id === warehouse.id).length - 1
            }
          />
        ))}
      </div>

      {prices?.length > 0 && <Divider className="mt-4" variant="dashed" />}

      <div className="flex flex-col justify-between gap-2 md:flex-row">
        <button
          className="mt-4 rounded border border-purple-500/10 bg-purple-500/10 px-4 py-2 font-semibold text-purple-500 transition hover:bg-purple-500/20 dark:border-purple-300/10 dark:bg-purple-300/10 dark:text-purple-300 dark:hover:bg-purple-300/20"
          onClick={addEmptyPrice}
        >
          + Thêm đơn giá
        </button>

        {productId && pricesChanged && (
          <div className="mt-4 flex flex-col gap-2 md:flex-row">
            <button
              className="text-foreground/80 rounded border border-zinc-500/10 bg-zinc-500/10 px-4 py-2 font-semibold transition hover:bg-zinc-500/20 dark:border-zinc-300/10 dark:bg-zinc-300/10 dark:text-zinc-300 dark:hover:bg-zinc-300/20"
              onClick={resetPrices}
            >
              Hủy
            </button>
            <button
              className={`rounded border border-green-500/10 bg-green-500/10 px-4 py-2 font-semibold text-green-500 transition dark:border-green-300/10 dark:bg-green-300/10 dark:text-green-300 ${
                hasRequiredFields()
                  ? 'hover:bg-green-500/20 dark:hover:bg-green-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
            >
              Lưu
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default WarehouseProductsInput;
