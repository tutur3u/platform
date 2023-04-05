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
import { Product } from '../../../types/primitives/Product';

interface Props {
  wsId: string;
  invoiceId: string;
  products: Product[];
}

interface Progress {
  removeProducts: Status;
  remove: Status;
}

const DeleteModal = ({ wsId, invoiceId, products }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    removeProducts: 'idle',
    remove: 'idle',
  });

  const hasError =
    progress.removeProducts === 'error' || progress.remove === 'error';

  const hasSuccess =
    progress.removeProducts === 'success' && progress.remove === 'success';

  useEffect(() => {
    if (!hasSuccess) return;

    showNotification({
      title: 'Thành công',
      message: 'Đã xoá hoá đơn',
      color: 'green',
    });
  }, [hasSuccess, invoiceId]);

  const removeProducts = async (products: Product[]) => {
    const removePromises = products.map((p) =>
      fetch(
        `/api/workspaces/${wsId}/finance/invoices/${invoiceId}/products/${p.id}?unitId=${p.unit_id}`,
        {
          method: 'DELETE',
        }
      )
    );

    const res = await Promise.all(removePromises);

    if (res.every((res) => res.ok)) {
      setProgress((progress) => ({ ...progress, removeProducts: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể xoá các sản phẩm',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, removeProducts: 'error' }));
      return false;
    }
  };

  const remove = async () => {
    const res = await fetch(
      `/api/workspaces/${wsId}/finance/invoices/${invoiceId}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      setProgress((progress) => ({
        ...progress,
        remove: 'success',
      }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể xoá hoá đơn',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, remove: 'error' }));
      return false;
    }
  };

  const handleDelete = async () => {
    if (!invoiceId) return;

    setProgress((progress) => ({ ...progress, removeProducts: 'loading' }));
    if (products.length) await removeProducts(products);
    else
      setProgress((progress) => ({ ...progress, removeProducts: 'success' }));
    mutate(`/api/workspaces/${wsId}/finance/invoices/${invoiceId}/products`);

    setProgress((progress) => ({ ...progress, removeDetails: 'loading' }));
    await remove();
    mutate(`/api/workspaces/${wsId}/finance/invoices/${invoiceId}`);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.remove === 'success'
            ? 2
            : progress.removeProducts === 'success'
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
          title={`Xoá sản phẩm (${products?.length || 0})`}
        >
          {progress.removeProducts === 'success' ? (
            <div className="text-green-300">
              Đã xoá {products?.length || 0} sản phẩm
            </div>
          ) : progress.removeProducts === 'error' ? (
            <div className="text-red-300">
              Không thể xoá {products?.length || 0} sản phẩm
            </div>
          ) : progress.removeProducts === 'loading' ? (
            <div className="text-blue-300">
              Đang xoá {products?.length || 0} sản phẩm
            </div>
          ) : (
            <div className="text-zinc-400/80">
              Đang chờ xoá {products?.length || 0} sản phẩm
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title="Xoá hoá đơn"
        >
          {progress.remove === 'success' ? (
            <div className="text-green-300">Đã xoá hoá đơn</div>
          ) : progress.remove === 'error' ? (
            <div className="text-red-300">Không thể xoá hoá đơn</div>
          ) : progress.remove === 'loading' ? (
            <div className="text-blue-300">Đang xoá hoá đơn</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ xoá hoá đơn</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title="Hoàn tất"
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.remove === 'success' ? (
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
              router.push(`/${wsId}/finance/invoices`);
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

export default DeleteModal;
