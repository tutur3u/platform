import { Timeline } from '@mantine/core';
import { useEffect, useState } from 'react';
import { CheckBadgeIcon, PlusIcon } from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import { useRouter } from 'next/router';
import { mutate } from 'swr';
import { Status } from '../status';
import { ProductUnit } from '../../../types/primitives/ProductUnit';

interface Props {
  wsId: string;
  oldUnit: ProductUnit;
  unit: ProductUnit;
}

interface Progress {
  updated: Status;
}

const UnitEditModal = ({ wsId, oldUnit, unit }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    updated: 'idle',
  });

  const hasError = progress.updated === 'error';
  const hasSuccess = progress.updated === 'success';

  useEffect(() => {
    if (!hasSuccess) return;

    mutate(`/api/workspaces/${wsId}/inventory/units/${unit.id}`);

    showNotification({
      title: 'Thành công',
      message: 'Đã cập nhật đơn vị tính',
      color: 'green',
    });
  }, [hasSuccess, wsId, unit.id]);

  const updateDetails = async () => {
    // If the unit is not changed, skip this step
    if (oldUnit.name === unit.name) {
      setProgress((progress) => ({ ...progress, updated: 'success' }));
      return true;
    }

    const { id, name } = unit;

    const res = await fetch(`/api/workspaces/${wsId}/inventory/units/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
      }),
    });

    if (res.ok) {
      setProgress((progress) => ({ ...progress, updated: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể cập nhật đơn vị tính',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, updated: 'error' }));
      return false;
    }
  };

  const handleEdit = async () => {
    if (!unit.id) return;

    setProgress((progress) => ({ ...progress, updated: 'loading' }));
    updateDetails();
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={progress.updated === 'success' ? 1 : 0}
        bulletSize={32}
        lineWidth={4}
        color={started ? 'green' : 'gray'}
        className="mt-2"
      >
        <Timeline.Item
          bullet={<PlusIcon className="h-5 w-5" />}
          title="Cập nhật thông tin cơ bản"
        >
          {progress.updated === 'success' ? (
            <div className="text-green-300">Đã cập nhật thông tin cơ bản</div>
          ) : progress.updated === 'error' ? (
            <div className="text-red-300">
              Không thể cập nhật thông tin cơ bản
            </div>
          ) : progress.updated === 'loading' ? (
            <div className="text-blue-300">Đang cập nhật thông tin cơ bản</div>
          ) : (
            <div className="text-zinc-400/80">
              Đang chờ cập nhật thông tin cơ bản
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title="Hoàn tất"
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.updated === 'success' ? (
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

        {unit.id && hasSuccess && (
          <button
            className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
            onClick={() => closeAllModals()}
          >
            Xem đơn vị tính
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
              router.push(`/${wsId}/inventory/units`);
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

export default UnitEditModal;
