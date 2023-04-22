import { Timeline } from '@mantine/core';
import { ProductPrice } from '../../../types/primitives/ProductPrice';
import { useState } from 'react';
import { BanknotesIcon, CheckBadgeIcon } from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import { Status } from '../status';
import { mutate } from 'swr';

interface Props {
  wsId: string;
  productId: string;
  warehouseId: string;

  oldPrices: ProductPrice[];
  prices: ProductPrice[];

  onSuccess?: () => void;
  onError?: () => void;
}

interface Progress {
  updatePrices: Status;
  removePrices: Status;
  addPrices: Status;
}

const InventoryProductEditModal = ({
  wsId,
  productId,
  warehouseId,

  oldPrices,
  prices,

  onSuccess,
  onError,
}: Props) => {
  const [progress, setProgress] = useState<Progress>({
    updatePrices: 'idle',
    removePrices: 'idle',
    addPrices: 'idle',
  });

  const hasError =
    progress.updatePrices === 'error' ||
    progress.removePrices === 'error' ||
    progress.addPrices === 'error';

  const hasSuccess =
    progress.updatePrices === 'success' &&
    progress.removePrices === 'success' &&
    progress.addPrices === 'success';

  const updatePrices = async (prices: ProductPrice[]) => {
    const updatePromises = prices.map((price) =>
      fetch(
        `/api/workspaces/${wsId}/inventory/products/${productId}/warehouses/${warehouseId}/${price.unit_id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(price),
        }
      )
    );

    const res = await Promise.all(updatePromises);

    if (res.every((res) => res.ok)) {
      setProgress((progress) => ({ ...progress, updatePrices: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể cập nhật các đơn giá',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, updatePrices: 'error' }));
      return false;
    }
  };

  const removePrices = async (prices: ProductPrice[]) => {
    const removePromises = prices.map((price) =>
      fetch(
        `/api/workspaces/${wsId}/inventory/products/${productId}/warehouses/${warehouseId}/${price.unit_id}`,
        {
          method: 'DELETE',
        }
      )
    );

    const res = await Promise.all(removePromises);

    if (res.every((res) => res.ok)) {
      setProgress((progress) => ({ ...progress, removePrices: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể xoá các đơn giá',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, removePrices: 'error' }));
      return false;
    }
  };

  const addPrices = async (prices: ProductPrice[]) => {
    const res = await fetch(
      `/api/workspaces/${wsId}/inventory/products/${productId}/warehouses/${warehouseId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prices }),
      }
    );

    if (res) {
      setProgress((progress) => ({ ...progress, addPrices: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể thêm các đơn giá',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, addPrices: 'error' }));
      return false;
    }
  };

  const pricesToUpdate = prices.filter((price) =>
    oldPrices.find((oldPrice) => oldPrice.unit_id === price.unit_id)
  );

  const pricesToRemove = oldPrices.filter(
    (oldPrice) => !prices.find((price) => price.unit_id === oldPrice.unit_id)
  );

  const pricesToAdd = prices.filter(
    (price) => !oldPrices.find((oldPrice) => oldPrice.unit_id === price.unit_id)
  );

  const handleEdit = async () => {
    setProgress((progress) => ({ ...progress, updatePrices: 'loading' }));
    if (pricesToUpdate.length) updatePrices(pricesToUpdate);
    else setProgress((progress) => ({ ...progress, updatePrices: 'success' }));

    setProgress((progress) => ({ ...progress, removePrices: 'loading' }));
    if (pricesToRemove.length) removePrices(pricesToRemove);
    else setProgress((progress) => ({ ...progress, removePrices: 'success' }));

    setProgress((progress) => ({ ...progress, addPrices: 'loading' }));
    if (pricesToAdd.length) addPrices(pricesToAdd);
    else setProgress((progress) => ({ ...progress, addPrices: 'success' }));

    mutate(
      `/api/workspaces/${wsId}/inventory/products/${productId}/warehouses/${warehouseId}`
    );
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.addPrices === 'success'
            ? 3
            : progress.removePrices === 'success'
            ? 2
            : progress.updatePrices === 'success'
            ? 1
            : 0
        }
        bulletSize={32}
        lineWidth={4}
        color={started ? 'green' : 'gray'}
        className="mt-2"
      >
        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Cập nhật đơn giá (${pricesToUpdate?.length || 0})`}
        >
          {progress.updatePrices === 'success' ? (
            <div className="text-green-300">
              Đã cập nhật {pricesToUpdate.length} đơn giá
            </div>
          ) : progress.updatePrices === 'error' ? (
            <div className="text-red-300">Không thể cập nhật đơn giá</div>
          ) : progress.updatePrices === 'loading' ? (
            <div className="text-blue-300">
              Đang cập nhật {pricesToUpdate.length} đơn giá
            </div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ cập nhật đơn giá</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Xoá đơn giá (${pricesToRemove?.length || 0})`}
        >
          {progress.removePrices === 'success' ? (
            <div className="text-green-300">
              Đã xoá {pricesToRemove.length} đơn giá
            </div>
          ) : progress.removePrices === 'error' ? (
            <div className="text-red-300">Không thể xoá đơn giá</div>
          ) : progress.removePrices === 'loading' ? (
            <div className="text-blue-300">
              Đang xoá {pricesToRemove.length} đơn giá
            </div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ xoá đơn giá</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Thêm đơn giá (${pricesToAdd?.length || 0})`}
        >
          {progress.addPrices === 'success' ? (
            <div className="text-green-300">
              Đã thêm {pricesToAdd.length} đơn giá
            </div>
          ) : progress.addPrices === 'error' ? (
            <div className="text-red-300">Không thể thêm đơn giá</div>
          ) : progress.addPrices === 'loading' ? (
            <div className="text-blue-300">
              Đang thêm {pricesToAdd.length} đơn giá
            </div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ thêm đơn giá</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title="Hoàn tất"
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.addPrices === 'success' ? (
            <div className="text-green-300">Đã hoàn tất</div>
          ) : hasError ? (
            <div className="text-red-300">Đã huỷ hoàn tất</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ hoàn tất</div>
          )}
        </Timeline.Item>
      </Timeline>

      <div className="mt-4 flex justify-end gap-2">
        {started || (
          <button
            className="rounded border border-zinc-300/10 bg-zinc-300/10 px-4 py-1 font-semibold text-zinc-300 transition hover:bg-zinc-300/20"
            onClick={() => closeAllModals()}
          >
            Huỷ
          </button>
        )}

        <button
          className={`rounded border px-4 py-1 font-semibold transition ${
            hasError
              ? 'border-red-300/10 bg-red-300/10 text-red-300 hover:bg-red-300/20'
              : hasSuccess
              ? 'border-green-300/10 bg-green-300/10 text-green-300 hover:bg-green-300/20'
              : started
              ? 'cursor-not-allowed border-zinc-300/10 bg-zinc-300/10 text-zinc-300/50'
              : 'border-blue-300/10 bg-blue-300/10 text-blue-300 hover:bg-blue-300/20'
          }`}
          onClick={() => {
            if (hasError) {
              if (onError) onError();
              closeAllModals();
              return;
            }

            if (hasSuccess) {
              if (onSuccess) onSuccess();
              closeAllModals();
              return;
            }

            if (!started) {
              setStarted(true);
              handleEdit();
            }
          }}
        >
          {hasError
            ? 'Quay lại'
            : hasSuccess
            ? 'Hoàn tất'
            : started
            ? 'Đang tạo'
            : 'Bắt đầu'}
        </button>
      </div>
    </>
  );
};

export default InventoryProductEditModal;
