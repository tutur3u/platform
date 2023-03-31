import { Timeline } from '@mantine/core';
import { useEffect, useState } from 'react';
import {
  BanknotesIcon,
  CheckBadgeIcon,
  PlusIcon,
} from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import { useRouter } from 'next/router';
import { Status } from '../status';
import { mutate } from 'swr';

interface Props {
  wsId: string;
  productId: string;
  unitIds: string[];
}

interface Progress {
  removePrices: Status;
  removeDetails: Status;
}

const ProductDeleteModal = ({ wsId, productId, unitIds }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    removePrices: 'idle',
    removeDetails: 'idle',
  });

  const hasError =
    progress.removePrices === 'error' || progress.removeDetails === 'error';

  const hasSuccess =
    progress.removePrices === 'success' && progress.removeDetails === 'success';

  useEffect(() => {
    if (!hasSuccess) return;

    showNotification({
      title: 'Thành công',
      message: 'Đã xoá sản phẩm',
      color: 'green',
    });
  }, [hasSuccess, productId]);

  const removePrices = async (unitIds: string[]) => {
    const removePromises = unitIds.map((uid) =>
      fetch(
        `/api/workspaces/${wsId}/inventory/products/${productId}/prices/${uid}`,
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

  const removeDetails = async () => {
    const res = await fetch(
      `/api/workspaces/${wsId}/inventory/products/${productId}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      setProgress((progress) => ({ ...progress, removeDetails: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể xoá thông tin sản phẩm',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, removeDetails: 'error' }));
      return false;
    }
  };

  const handleDelete = async () => {
    if (!productId) return;

    setProgress((progress) => ({ ...progress, removePrices: 'loading' }));
    if (unitIds.length) await removePrices(unitIds);
    else setProgress((progress) => ({ ...progress, removePrices: 'success' }));
    mutate(`/api/workspaces/${wsId}/inventory/products/${productId}/prices`);

    setProgress((progress) => ({ ...progress, removeDetails: 'loading' }));
    await removeDetails();
    mutate(`/api/workspaces/${wsId}/inventory/products/${productId}`);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.removeDetails === 'success'
            ? 2
            : progress.removePrices === 'success'
            ? 1
            : 0
        }
        bulletSize={32}
        lineWidth={4}
        color={started ? 'green' : 'gray'}
        className="mt-2"
      >
        <Timeline.Item
          bullet={<PlusIcon className="h-5 w-5" />}
          title={`Xoá đơn giá (${unitIds?.length || 0})`}
        >
          {progress.removePrices === 'success' ? (
            <div className="text-green-300">
              Đã xoá {unitIds?.length || 0} đơn giá
            </div>
          ) : progress.removePrices === 'error' ? (
            <div className="text-red-300">
              Không thể xoá {unitIds?.length || 0} đơn giá
            </div>
          ) : progress.removePrices === 'loading' ? (
            <div className="text-blue-300">
              Đang xoá {unitIds?.length || 0} đơn giá
            </div>
          ) : (
            <div className="text-zinc-400/80">
              Đang chờ xoá {unitIds?.length || 0} đơn giá
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title="Xoá thông tin sản phẩm"
        >
          {progress.removeDetails === 'success' ? (
            <div className="text-green-300">Đã xoá thông tin sản phẩm</div>
          ) : progress.removeDetails === 'error' ? (
            <div className="text-red-300">Không thể xoá thông tin sản phẩm</div>
          ) : progress.removeDetails === 'loading' ? (
            <div className="text-blue-300">Đang xoá thông tin sản phẩm</div>
          ) : (
            <div className="text-zinc-400/80">
              Đang chờ xoá thông tin sản phẩm
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title="Hoàn tất"
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.removeDetails === 'success' ? (
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
              closeAllModals();
              return;
            }

            if (hasSuccess) {
              router.push(`/${wsId}/inventory/products`);
              closeAllModals();
              return;
            }

            if (!started) {
              setStarted(true);
              handleDelete();
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

export default ProductDeleteModal;
