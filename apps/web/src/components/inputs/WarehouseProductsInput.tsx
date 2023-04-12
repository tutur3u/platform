import { Divider } from '@mantine/core';
import { ProductWarehouse } from '../../types/primitives/ProductWarehouse';
import ProductPriceInput from './ProductPriceInput';
import { useEffect, useState } from 'react';
import { ProductPrice } from '../../types/primitives/ProductPrice';
import useSWR from 'swr';
import { openModal } from '@mantine/modals';
import InventoryProductEditModal from '../loaders/products/InventoryProductEditModal';

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

  useEffect(() => {
    if (productPrices) setPrices(productPrices);
  }, [productPrices, setPrices]);

  const resetPrices = () => {
    setPrices(productPrices ?? []);
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
  };

  const updatePrice = (id: string, price: number | '') => {
    const index = prices.findIndex((price) => price.unit_id === id);

    if (index === -1) return;

    setPrices((prices) => {
      const newPrices = [...prices];
      newPrices[index].price = price === '' ? null : price;
      return newPrices;
    });
  };

  const updateMinAmount = (id: string, amount: number | '') => {
    const index = prices.findIndex((price) => price.unit_id === id);

    if (index === -1) return;

    setPrices((prices) => {
      const newPrices = [...prices];
      newPrices[index].min_amount = amount === '' ? null : amount;
      return newPrices;
    });
  };

  const getUniqueUnitIds = () => {
    const unitIds = new Set<string>();
    prices.forEach((price) => unitIds.add(price.unit_id));
    return Array.from(unitIds);
  };

  const removePrice = (index: number) => {
    setPrices((prices) => prices.filter((_, idx) => idx !== index));
  };

  const showEditModal = () => {
    if (!hasRequiredFields()) return;
    if (!productPrices || !productId) return;

    openModal({
      title: <div className="font-semibold">Cập nhật đơn giá</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <InventoryProductEditModal
          wsId={wsId}
          productId={productId}
          warehouseId={warehouse.id}
          oldPrices={productPrices}
          prices={prices}
        />
      ),
    });
  };

  return (
    <div className="rounded border border-zinc-300/10 bg-zinc-900 p-4">
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
            updatePrice={(unitId, price) => updatePrice(unitId, price)}
            updateMinAmount={(unitId, amount) =>
              updateMinAmount(unitId, amount)
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
          className="mt-4 rounded border border-purple-300/10 bg-purple-300/10 px-4 py-2 font-semibold text-purple-300 transition hover:bg-purple-300/20"
          onClick={addEmptyPrice}
        >
          + Thêm đơn giá
        </button>

        {productId && (
          <div className="mt-4 flex flex-col gap-2 md:flex-row">
            <button
              className="rounded border border-zinc-300/10 bg-zinc-300/10 px-4 py-2 font-semibold text-zinc-300 transition hover:bg-zinc-300/20"
              onClick={resetPrices}
            >
              Hủy
            </button>
            <button
              className={`rounded border border-green-300/10 bg-green-300/10 px-4 py-2 font-semibold text-green-300 transition ${
                hasRequiredFields()
                  ? 'hover:bg-green-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={hasRequiredFields() ? showEditModal : undefined}
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
