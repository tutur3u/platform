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
import { VitalGroup } from '../../../types/primitives/VitalGroup';

interface Props {
  wsId: string;
  checkupId: string;
  vitals: Vital[];
  groups: VitalGroup[];
}

interface Progress {
  removeVitals: Status;
  removeGroups: Status;
  removeCheckup: Status;
}

const CheckupDeleteModal = ({ wsId, checkupId, vitals, groups }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    removeVitals: 'idle',
    removeGroups: 'idle',
    removeCheckup: 'idle',
  });

  const hasError =
    progress.removeVitals === 'error' ||
    progress.removeGroups === 'error' ||
    progress.removeCheckup === 'error';

  const hasSuccess =
    progress.removeVitals === 'success' &&
    progress.removeGroups === 'success' &&
    progress.removeCheckup === 'success';

  useEffect(() => {
    if (!hasSuccess) return;

    showNotification({
      title: 'Thành công',
      message: 'Đã xoá đơn kiểm tra sức khoẻ',
      color: 'green',
    });
  }, [hasSuccess, checkupId]);

  const removeVitals = async (vitals: Vital[]) => {
    const removePromises = vitals.map((v) =>
      fetch(
        `/api/workspaces/${wsId}/healthcare/checkups/${checkupId}/vitals/${v.id}`,
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

  const removeGroups = async (groups: VitalGroup[]) => {
    const removePromises = groups.map((g) =>
      fetch(
        `/api/workspaces/${wsId}/healthcare/checkups/${checkupId}/vital-groups/${g.id}`,
        {
          method: 'DELETE',
        }
      )
    );

    const res = await Promise.all(removePromises);

    if (res.every((res) => res.ok)) {
      setProgress((progress) => ({ ...progress, removeGroups: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể xoá các nhóm chỉ số',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, removeGroups: 'error' }));
      return false;
    }
  };

  const removeCheckup = async () => {
    const res = await fetch(
      `/api/workspaces/${wsId}/healthcare/checkups/${checkupId}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      setProgress((progress) => ({
        ...progress,
        removeCheckup: 'success',
      }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể xoá đơn kiểm tra sức khoẻ',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, removeCheckup: 'error' }));
      return false;
    }
  };

  const handleDelete = async () => {
    if (!checkupId) return;

    setProgress((progress) => ({ ...progress, removeVitals: 'loading' }));
    setProgress((progress) => ({ ...progress, removeGroups: 'loading' }));

    if (vitals.length) await removeVitals(vitals);
    else setProgress((progress) => ({ ...progress, removeVitals: 'success' }));

    if (groups.length) await removeGroups(groups);
    else setProgress((progress) => ({ ...progress, removeGroups: 'success' }));

    mutate(`/api/workspaces/${wsId}/healthcare/checkups/${checkupId}/vitals`);
    mutate(
      `/api/workspaces/${wsId}/healthcare/checkups/${checkupId}/vital-groups`
    );

    setProgress((progress) => ({ ...progress, removeDetails: 'loading' }));
    await removeCheckup();

    mutate(`/api/workspaces/${wsId}/healthcare/checkups/${checkupId}`);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.removeCheckup === 'success'
            ? 3
            : progress.removeGroups === 'success'
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
          bullet={<PlusIcon className="h-5 w-5" />}
          title={`Xoá nhóm chỉ số (${groups?.length || 0})`}
        >
          {progress.removeVitals === 'success' ? (
            <div className="text-green-300">
              Đã xoá {groups?.length || 0} nhóm chỉ số
            </div>
          ) : progress.removeVitals === 'error' ? (
            <div className="text-red-300">
              Không thể xoá {groups?.length || 0} nhóm chỉ số
            </div>
          ) : progress.removeVitals === 'loading' ? (
            <div className="text-blue-300">
              Đang xoá {groups?.length || 0} nhóm chỉ số
            </div>
          ) : (
            <div className="text-zinc-400/80">
              Đang chờ xoá {groups?.length || 0} nhóm chỉ số
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title="Xoá đơn kiểm tra sức khoẻ"
        >
          {progress.removeCheckup === 'success' ? (
            <div className="text-green-300">Đã xoá đơn kiểm tra sức khoẻ</div>
          ) : progress.removeCheckup === 'error' ? (
            <div className="text-red-300">
              Không thể xoá đơn kiểm tra sức khoẻ
            </div>
          ) : progress.removeCheckup === 'loading' ? (
            <div className="text-blue-300">Đang xoá đơn kiểm tra sức khoẻ</div>
          ) : (
            <div className="text-zinc-400/80">
              Đang chờ xoá đơn kiểm tra sức khoẻ
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title="Hoàn tất"
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.removeCheckup === 'success' ? (
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
              router.push(`/${wsId}/healthcare/checkups`);
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

export default CheckupDeleteModal;
