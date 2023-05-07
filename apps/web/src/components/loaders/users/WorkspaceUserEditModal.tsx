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
import { WorkspaceUser } from '../../../types/primitives/WorkspaceUser';
import { UserGroup } from '../../../types/primitives/UserGroup';

interface Props {
  wsId: string;
  user: WorkspaceUser;
  oldGroups: UserGroup[];
  groups: UserGroup[];
}

interface Progress {
  updatedDetails: Status;
  removeGroups: Status;
  addGroups: Status;
}

const WorkspaceUserEditModal = ({ wsId, user, oldGroups, groups }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    updatedDetails: 'idle',
    removeGroups: 'idle',
    addGroups: 'idle',
  });

  const hasError =
    progress.updatedDetails === 'error' ||
    progress.removeGroups === 'error' ||
    progress.addGroups === 'error';

  const hasSuccess =
    progress.updatedDetails === 'success' &&
    progress.removeGroups === 'success' &&
    progress.addGroups === 'success';

  useEffect(() => {
    if (!hasSuccess) return;

    mutate(`/api/workspaces/${wsId}/users/${user.id}`);

    showNotification({
      title: 'Thành công',
      message: 'Đã cập nhật người dùng',
      color: 'green',
    });
  }, [hasSuccess, user.id, wsId]);

  const updateDetails = async () => {
    const res = await fetch(`/api/workspaces/${wsId}/users/${user.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(user),
    });

    if (res.ok) {
      setProgress((progress) => ({ ...progress, updatedDetails: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể cập nhật người dùng',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, updatedDetails: 'error' }));
      return false;
    }
  };

  const removeGroups = async (groups: UserGroup[]) => {
    const removePromises = groups.map((group) =>
      fetch(`/api/workspaces/${wsId}/users/${user.id}/groups/${group.id}`, {
        method: 'DELETE',
      })
    );

    const res = await Promise.all(removePromises);

    if (res.every((res) => res.ok)) {
      setProgress((progress) => ({ ...progress, removeGroups: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể xoá các vai trò',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, removeGroups: 'error' }));
      return false;
    }
  };

  const addGroups = async (groups: UserGroup[]) => {
    const res = await fetch(`/api/workspaces/${wsId}/users/${user.id}/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ groups }),
    });

    if (res) {
      setProgress((progress) => ({ ...progress, addGroups: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể thêm các vai trò',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, addGroups: 'error' }));
      return false;
    }
  };

  const groupsToRemove = oldGroups.filter(
    (oldGroup) => !groups.find((group) => group.id === oldGroup.id)
  );

  const groupsToAdd = groups.filter(
    (group) => !oldGroups.find((oldGroup) => group.id === oldGroup.id)
  );

  const handleEdit = async () => {
    if (!user.id) return;

    setProgress((progress) => ({ ...progress, updateDetails: 'loading' }));
    await updateDetails();

    mutate(`/api/workspaces/${wsId}/users/${user.id}`);

    setProgress((progress) => ({ ...progress, removeGroups: 'loading' }));
    if (groupsToRemove.length) await removeGroups(groupsToRemove);
    else setProgress((progress) => ({ ...progress, removeGroups: 'success' }));

    setProgress((progress) => ({ ...progress, addGroups: 'loading' }));
    if (groupsToAdd.length) await addGroups(groupsToAdd);
    else setProgress((progress) => ({ ...progress, addGroups: 'success' }));

    mutate(`/api/workspaces/${wsId}/users/${user.id}/groups`);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.addGroups === 'success'
            ? 3
            : progress.removeGroups === 'success'
            ? 2
            : progress.updatedDetails === 'success'
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
          {progress.updatedDetails === 'success' ? (
            <div className="text-green-300">Đã cập nhật thông tin cơ bản</div>
          ) : progress.updatedDetails === 'error' ? (
            <div className="text-red-300">
              Không thể cập nhật thông tin cơ bản
            </div>
          ) : progress.updatedDetails === 'loading' ? (
            <div className="text-blue-300">Đang cập nhật thông tin cơ bản</div>
          ) : (
            <div className="text-zinc-400/80">
              Đang chờ cập nhật thông tin cơ bản
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Xoá vai trò (${groupsToRemove?.length || 0})`}
        >
          {progress.removeGroups === 'success' ? (
            <div className="text-green-300">
              Đã xoá {groupsToRemove.length} vai trò
            </div>
          ) : progress.removeGroups === 'error' ? (
            <div className="text-red-300">Không thể xoá vai trò</div>
          ) : progress.removeGroups === 'loading' ? (
            <div className="text-blue-300">
              Đang xoá {groupsToRemove.length} vai trò
            </div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ xoá vai trò</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Thêm vai trò (${groupsToAdd?.length || 0})`}
        >
          {progress.addGroups === 'success' ? (
            <div className="text-green-300">
              Đã thêm {groupsToAdd.length} vai trò
            </div>
          ) : progress.addGroups === 'error' ? (
            <div className="text-red-300">Không thể thêm vai trò</div>
          ) : progress.addGroups === 'loading' ? (
            <div className="text-blue-300">
              Đang thêm {groupsToAdd.length} vai trò
            </div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ thêm vai trò</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title="Hoàn tất"
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.updatedDetails === 'success' ? (
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

        {user.id && hasSuccess && (
          <button
            className="rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition hover:bg-blue-300/20"
            onClick={() => closeAllModals()}
          >
            Xem người dùng
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
              router.push(`/${wsId}/users/list`);
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

export default WorkspaceUserEditModal;
