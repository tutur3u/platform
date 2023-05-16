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
import { Checkup } from '../../../types/primitives/Checkup';
import { Vital } from '../../../types/primitives/Vital';
import { VitalGroup } from '../../../types/primitives/VitalGroup';

interface Props {
  wsId: string;

  oldVitals: Vital[];
  oldGroups: VitalGroup[];

  checkup: Checkup;
  vitals: Vital[];
  groups: VitalGroup[];
}

interface Progress {
  updateDetails: Status;
  updateVitals: Status;
  removeVitals: Status;
  addVitals: Status;
  removeGroups: Status;
  addGroups: Status;
}

const CheckupEditModal = ({
  wsId,

  oldVitals,
  oldGroups,

  checkup,
  vitals,
  groups,
}: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    updateDetails: 'idle',
    removeVitals: 'idle',
    addVitals: 'idle',
    updateVitals: 'idle',
    removeGroups: 'idle',
    addGroups: 'idle',
  });

  const hasError =
    progress.updateDetails === 'error' ||
    progress.removeVitals === 'error' ||
    progress.addVitals === 'error' ||
    progress.updateVitals === 'error' ||
    progress.removeGroups === 'error' ||
    progress.addGroups === 'error';

  const hasSuccess =
    progress.updateDetails === 'success' &&
    progress.removeVitals === 'success' &&
    progress.addVitals === 'success' &&
    progress.updateVitals === 'success' &&
    progress.removeGroups === 'success' &&
    progress.addGroups === 'success';

  useEffect(() => {
    if (!hasSuccess) return;

    mutate(`/api/workspaces/${wsId}/healthcare/checkups/${checkup.id}`);
    mutate(`/api/workspaces/${wsId}/healthcare/checkups/${checkup.id}/vitals`);
    mutate(
      `/api/workspaces/${wsId}/healthcare/checkups/${checkup.id}/vital-groups`
    );

    showNotification({
      title: 'Thành công',
      message: 'Đã cập nhật đơn kiểm tra sức khoẻ',
      color: 'green',
    });
  }, [hasSuccess, wsId, checkup.id]);

  const updateDetails = async () => {
    const res = await fetch(
      `/api/workspaces/${wsId}/healthcare/checkups/${checkup.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(checkup),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({ ...progress, updateDetails: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể cập nhật đơn kiểm tra sức khoẻ',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, updateDetails: 'error' }));
      return false;
    }
  };

  const removeVitals = async (vitals: Vital[]) => {
    const removePromises = vitals.map((vital) =>
      fetch(
        `/api/workspaces/${wsId}/healthcare/checkups/${checkup.id}/vitals/${vital.id}`,
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
      `/api/workspaces/${wsId}/healthcare/checkups/${checkup.id}/vitals`,
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

  const updateVitals = async (vitals: Vital[]) => {
    const updatePromises = vitals.map((vital) =>
      fetch(
        `/api/workspaces/${wsId}/healthcare/checkups/${checkup.id}/vitals/${vital.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(vital),
        }
      )
    );

    const res = await Promise.all(updatePromises);

    if (res.every((res) => res.ok)) {
      setProgress((progress) => ({ ...progress, updateVitals: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể cập nhật các chỉ số',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, updateVitals: 'error' }));
      return false;
    }
  };

  const removeGroups = async (groups: VitalGroup[]) => {
    const removePromises = groups.map((group) =>
      fetch(
        `/api/workspaces/${wsId}/healthcare/checkups/${checkup.id}/vital-groups/${group.id}`,
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

  const addGroups = async (groups: VitalGroup[]) => {
    const res = await fetch(
      `/api/workspaces/${wsId}/healthcare/checkups/${checkup.id}/vital-groups`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ groups }),
      }
    );

    if (res) {
      setProgress((progress) => ({ ...progress, addGroups: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể thêm các nhóm chỉ số',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, addGroups: 'error' }));
      return false;
    }
  };

  const vitalsToRemove = oldVitals.filter(
    (oldVital) => !vitals.find((vital) => vital.id === oldVital.id)
  );

  const vitalsToAdd = vitals.filter(
    (vital) => !oldVitals.find((oldVital) => vital.id === oldVital.id)
  );

  const vitalsToUpdate = vitals.filter((vital) =>
    oldVitals.find((oldVital) => vital.id === oldVital.id)
  );

  const groupsToRemove = oldGroups.filter(
    (oldGroup) => !groups.find((group) => group.id === oldGroup.id)
  );

  const groupsToAdd = groups.filter(
    (group) => !oldGroups.find((oldGroup) => group.id === oldGroup.id)
  );

  const handleEdit = async () => {
    if (!checkup.id) return;

    setProgress((progress) => ({ ...progress, updateDetails: 'loading' }));
    await updateDetails();

    mutate(`/api/workspaces/${wsId}/healthcare/checkups/${checkup.id}`);

    setProgress((progress) => ({ ...progress, removeVitals: 'loading' }));
    if (vitalsToRemove.length) await removeVitals(vitalsToRemove);
    else setProgress((progress) => ({ ...progress, removeVitals: 'success' }));

    setProgress((progress) => ({ ...progress, addVitals: 'loading' }));
    if (vitalsToAdd.length) await addVitals(vitalsToAdd);
    else setProgress((progress) => ({ ...progress, addVitals: 'success' }));

    setProgress((progress) => ({ ...progress, updateVitals: 'loading' }));
    if (vitalsToUpdate.length) await updateVitals(vitalsToUpdate);
    else setProgress((progress) => ({ ...progress, updateVitals: 'success' }));

    mutate(`/api/workspaces/${wsId}/healthcare/checkups/${checkup.id}/vitals`);

    setProgress((progress) => ({ ...progress, removeGroups: 'loading' }));
    if (groupsToRemove.length) await removeGroups(groupsToRemove);
    else setProgress((progress) => ({ ...progress, removeGroups: 'success' }));

    setProgress((progress) => ({ ...progress, addGroups: 'loading' }));
    if (groupsToAdd.length) await addGroups(groupsToAdd);
    else setProgress((progress) => ({ ...progress, addGroups: 'success' }));

    mutate(
      `/api/workspaces/${wsId}/healthcare/checkups/${checkup.id}/vital-groups`
    );
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.addGroups === 'success'
            ? 6
            : progress.removeGroups === 'success'
            ? 5
            : progress.updateVitals === 'success'
            ? 4
            : progress.addVitals === 'success'
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
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Cập nhật chỉ số (${vitalsToUpdate?.length || 0})`}
        >
          {progress.addVitals === 'success' ? (
            <div className="text-green-300">
              Đã cập nhật {vitalsToUpdate.length} chỉ số
            </div>
          ) : progress.addVitals === 'error' ? (
            <div className="text-red-300">Không thể cập nhật chỉ số</div>
          ) : progress.addVitals === 'loading' ? (
            <div className="text-blue-300">
              Đang cập nhật {vitalsToUpdate.length} chỉ số
            </div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ cập nhật chỉ số</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Xoá nhóm chỉ số (${groupsToRemove?.length || 0})`}
        >
          {progress.removeVitals === 'success' ? (
            <div className="text-green-300">
              Đã xoá {groupsToRemove.length} nhóm chỉ số
            </div>
          ) : progress.removeVitals === 'error' ? (
            <div className="text-red-300">Không thể xoá nhóm chỉ số</div>
          ) : progress.removeVitals === 'loading' ? (
            <div className="text-blue-300">
              Đang xoá {groupsToRemove.length} nhóm chỉ số
            </div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ xoá nhóm chỉ số</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Thêm nhóm chỉ số (${groupsToAdd?.length || 0})`}
        >
          {progress.addVitals === 'success' ? (
            <div className="text-green-300">
              Đã thêm {groupsToAdd.length} nhóm chỉ số
            </div>
          ) : progress.addVitals === 'error' ? (
            <div className="text-red-300">Không thể thêm nhóm chỉ số</div>
          ) : progress.addVitals === 'loading' ? (
            <div className="text-blue-300">
              Đang thêm {groupsToAdd.length} nhóm chỉ số
            </div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ thêm nhóm chỉ số</div>
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

        {checkup.id && hasSuccess && (
          <button
            className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
            onClick={() => closeAllModals()}
          >
            Xem đơn kiểm tra sức khoẻ
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

export default CheckupEditModal;
