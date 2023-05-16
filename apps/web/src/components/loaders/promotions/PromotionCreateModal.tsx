import { Timeline } from '@mantine/core';
import { useEffect, useState } from 'react';
import { CheckBadgeIcon, PlusIcon } from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Status } from '../status';
import { ProductPromotion } from '../../../types/primitives/ProductPromotion';

interface Props {
  wsId: string;
  promotion: Partial<ProductPromotion>;
}

interface Progress {
  created: Status;
}

const PromotionCreateModal = ({ wsId, promotion }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    created: 'idle',
  });

  const hasError = progress.created === 'error';
  const hasSuccess = progress.created === 'success';

  useEffect(() => {
    if (hasSuccess)
      showNotification({
        title: 'Thành công',
        message: 'Đã tạo mã giảm giá',
        color: 'green',
      });
  }, [hasSuccess]);

  const createPromotion = async () => {
    const res = await fetch(`/api/workspaces/${wsId}/inventory/promotions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(promotion),
    });

    if (res.ok) {
      setProgress((progress) => ({ ...progress, created: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo mã giảm giá',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, created: 'error' }));
      return false;
    }
  };

  const [promotionId, setPromotionId] = useState<string | null>(null);

  const handleCreate = async () => {
    setProgress((progress) => ({ ...progress, created: 'loading' }));
    const promotionId = await createPromotion();
    if (promotionId) setPromotionId(promotionId);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={progress.created === 'success' ? 1 : 0}
        bulletSize={32}
        lineWidth={4}
        color={started ? 'green' : 'gray'}
        className="mt-2"
      >
        <Timeline.Item
          bullet={<PlusIcon className="h-5 w-5" />}
          title="Tạo mã giảm giá"
        >
          {progress.created === 'success' ? (
            <div className="text-green-300">Đã tạo mã giảm giá</div>
          ) : progress.created === 'error' ? (
            <div className="text-red-300">Không thể tạo mã giảm giá</div>
          ) : progress.created === 'loading' ? (
            <div className="text-blue-300">Đang tạo mã giảm giá</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ tạo mã giảm giá</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title="Hoàn tất"
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.created === 'success' ? (
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

        {promotionId && (hasError || hasSuccess) && (
          <Link
            href={`/${wsId}/inventory/promotions/${promotionId}`}
            onClick={() => closeAllModals()}
            className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
          >
            Xem mã giảm giá
          </Link>
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
              router.push(`/${wsId}/inventory/promotions`);
              closeAllModals();
              return;
            }

            if (!started) {
              setStarted(true);
              handleCreate();
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

export default PromotionCreateModal;
