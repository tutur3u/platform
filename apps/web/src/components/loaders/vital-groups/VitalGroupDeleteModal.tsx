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
import { Vital } from '../../../types/primitives/Vital';

interface Props {
  wsId: string;
  groupId: string;
  vitals: Vital[];
}

interface Progress {
  removeVitals: Status;
  removeVitalGroup: Status;
}

const VitalGroupDeleteModal = ({ wsId, groupId, vitals }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    removeVitals: 'idle',
    removeVitalGroup: 'idle',
  });

  const hasError =
    progress.removeVitals === 'error' || progress.removeVitalGroup === 'error';

  const hasSuccess =
    progress.removeVitals === 'success' &&
    progress.removeVitalGroup === 'success';

  useEffect(() => {
    if (!hasSuccess) return;

    showNotification({
      title: 'Thành công',
      message: 'Đã xoá nhóm chỉ số',
      color: 'green',
    });
  }, [hasSuccess, groupId]);

  const removeVitals = async (vitals: Vital[]) => {
    const removePromises = vitals.map((v) =>
      fetch(
        `/api/workspaces/${wsId}/healthcare/vital-groups/${groupId}/vitals/${v.id}`,
        {
          method: 'DELETE',
        }
      )
    );

    const res = await Promise.all(removePromises);

    if (res.every((res) => res.ok)) {
      setProgress((progress) => ({ ...progress, removeVitals: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể xoá các chỉ số',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, removeVitals: 'error' }));
      return false;
    }
  };

  const removeVitalGroup = async () => {
    const res = await fetch(
      `/api/workspaces/${wsId}/healthcare/vital-groups/${groupId}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      setProgress((progress) => ({
        ...progress,
        removeVitalGroup: 'success',
      }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể xoá nhóm chỉ số',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, removeVitalGroup: 'error' }));
      return false;
    }
  };

  const handleDelete = async () => {
    if (!groupId) return;

    setProgress((progress) => ({ ...progress, removeVitals: 'loading' }));
    if (vitals.length) await removeVitals(vitals);
    else setProgress((progress) => ({ ...progress, removeVitals: 'success' }));
    mutate(`/api/workspaces/${wsId}/healthcare/vital-groups/${groupId}/vitals`);

    setProgress((progress) => ({ ...progress, removeDetails: 'loading' }));
    await removeVitalGroup();
    mutate(`/api/workspaces/${wsId}/healthcare/vital-groups/${groupId}`);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.removeVitalGroup === 'success'
            ? 2
            : progress.removeVitals === 'success'
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
          title={`Xoá chỉ số (${vitals?.length || 0})`}
        >
          {progress.removeVitals === 'success' ? (
            <div className="text-green-300">
              Đã xoá {vitals?.length || 0} chỉ số
            </div>
          ) : progress.removeVitals === 'error' ? (
            <div className="text-red-300">
              Không thể xoá {vitals?.length || 0} chỉ số
            </div>
          ) : progress.removeVitals === 'loading' ? (
            <div className="text-blue-300">
              Đang xoá {vitals?.length || 0} chỉ số
            </div>
          ) : (
            <div className="text-zinc-400/80">
              Đang chờ xoá {vitals?.length || 0} chỉ số
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title="Xoá nhóm chỉ số"
        >
          {progress.removeVitalGroup === 'success' ? (
            <div className="text-green-300">Đã xoá nhóm chỉ số</div>
          ) : progress.removeVitalGroup === 'error' ? (
            <div className="text-red-300">Không thể xoá nhóm chỉ số</div>
          ) : progress.removeVitalGroup === 'loading' ? (
            <div className="text-blue-300">Đang xoá nhóm chỉ số</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ xoá nhóm chỉ số</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title="Hoàn tất"
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.removeVitalGroup === 'success' ? (
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
              router.push(`/${wsId}/healthcare/vital-groups`);
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

export default VitalGroupDeleteModal;
