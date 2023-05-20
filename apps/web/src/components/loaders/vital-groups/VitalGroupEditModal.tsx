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
import { mutate } from 'swr';
import { Status } from '../status';
import { VitalGroup } from '../../../types/primitives/VitalGroup';
import { Vital } from '../../../types/primitives/Vital';

interface Props {
  wsId: string;

  oldVitals: Vital[];

  group: VitalGroup;
  vitals: Vital[];
}

interface Progress {
  updateDetails: Status;
  removeVitals: Status;
  addVitals: Status;
}

const VitalGroupEditModal = ({ wsId, oldVitals, group, vitals }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    updateDetails: 'idle',
    removeVitals: 'idle',
    addVitals: 'idle',
  });

  const hasError =
    progress.updateDetails === 'error' ||
    progress.removeVitals === 'error' ||
    progress.addVitals === 'error';

  const hasSuccess =
    progress.updateDetails === 'success' &&
    progress.removeVitals === 'success' &&
    progress.addVitals === 'success';

  useEffect(() => {
    if (!hasSuccess) return;

    mutate(`/api/workspaces/${wsId}/healthcare/vital-groups/${group.id}`);
    mutate(`/api/vital-groups/${group.id}/vitals`);

    showNotification({
      title: 'Thành công',
      message: 'Đã cập nhật nhóm chỉ số',
      color: 'green',
    });
  }, [hasSuccess, wsId, group.id]);

  const updateDetails = async () => {
    const res = await fetch(
      `/api/workspaces/${wsId}/healthcare/vital-groups/${group.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(group),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({ ...progress, updateDetails: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể cập nhật nhóm chỉ số',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, updateDetails: 'error' }));
      return false;
    }
  };

  const removeVitals = async (vitals: Vital[]) => {
    const removePromises = vitals.map((vital) =>
      fetch(
        `/api/workspaces/${wsId}/healthcare/vital-groups/${group.id}/vitals/${vital.id}`,
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

  const addVitals = async (vitals: Vital[]) => {
    const res = await fetch(
      `/api/workspaces/${wsId}/healthcare/vital-groups/${group.id}/vitals`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vitals }),
      }
    );

    if (res) {
      setProgress((progress) => ({ ...progress, addVitals: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể thêm các chỉ số',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, addVitals: 'error' }));
      return false;
    }
  };

  const vitalsToRemove = oldVitals.filter(
    (oldVital) => !vitals.find((vital) => vital.id === oldVital.id)
  );

  const vitalsToAdd = vitals.filter(
    (vital) => !oldVitals.find((oldVital) => vital.id === oldVital.id)
  );

  const handleEdit = async () => {
    if (!group.id) return;

    setProgress((progress) => ({ ...progress, updateDetails: 'loading' }));
    await updateDetails();

    mutate(`/api/workspaces/${wsId}/healthcare/vital-groups/${group.id}`);

    setProgress((progress) => ({ ...progress, removeVitals: 'loading' }));
    if (vitalsToRemove.length) await removeVitals(vitalsToRemove);
    else setProgress((progress) => ({ ...progress, removeVitals: 'success' }));

    setProgress((progress) => ({ ...progress, addVitals: 'loading' }));
    if (vitalsToAdd.length) await addVitals(vitalsToAdd);
    else setProgress((progress) => ({ ...progress, addVitals: 'success' }));

    mutate(
      `/api/workspaces/${wsId}/healthcare/vital-groups/${group.id}/vitals`
    );
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.addVitals === 'success'
            ? 3
            : progress.removeVitals === 'success'
            ? 2
            : progress.updateDetails === 'success'
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
          title="Cập nhật thông tin cơ bản"
        >
          {progress.updateDetails === 'success' ? (
            <div className="text-green-300">Đã cập nhật thông tin cơ bản</div>
          ) : progress.updateDetails === 'error' ? (
            <div className="text-red-300">
              Không thể cập nhật thông tin cơ bản
            </div>
          ) : progress.updateDetails === 'loading' ? (
            <div className="text-blue-300">Đang cập nhật thông tin cơ bản</div>
          ) : (
            <div className="text-zinc-400/80">
              Đang chờ cập nhật thông tin cơ bản
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Xoá chỉ số (${vitalsToRemove?.length || 0})`}
        >
          {progress.removeVitals === 'success' ? (
            <div className="text-green-300">
              Đã xoá {vitalsToRemove.length} chỉ số
            </div>
          ) : progress.removeVitals === 'error' ? (
            <div className="text-red-300">Không thể xoá chỉ số</div>
          ) : progress.removeVitals === 'loading' ? (
            <div className="text-blue-300">
              Đang xoá {vitalsToRemove.length} chỉ số
            </div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ xoá chỉ số</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Thêm chỉ số (${vitalsToAdd?.length || 0})`}
        >
          {progress.addVitals === 'success' ? (
            <div className="text-green-300">
              Đã thêm {vitalsToAdd.length} chỉ số
            </div>
          ) : progress.addVitals === 'error' ? (
            <div className="text-red-300">Không thể thêm chỉ số</div>
          ) : progress.addVitals === 'loading' ? (
            <div className="text-blue-300">
              Đang thêm {vitalsToAdd.length} chỉ số
            </div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ thêm chỉ số</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title="Hoàn tất"
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.addVitals === 'success' ? (
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

        {group.id && hasSuccess && (
          <button
            className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
            onClick={() => closeAllModals()}
          >
            Xem nhóm chỉ số
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

export default VitalGroupEditModal;
