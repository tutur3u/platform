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
import { UserRole } from '../../../types/primitives/UserRole';

interface Props {
  wsId: string;
  user: WorkspaceUser;
  oldRoles: UserRole[];
  roles: UserRole[];
}

interface Progress {
  updatedDetails: Status;
  removeRoles: Status;
  addRoles: Status;
}

const WorkspaceUserEditModal = ({ wsId, user, oldRoles, roles }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    updatedDetails: 'idle',
    removeRoles: 'idle',
    addRoles: 'idle',
  });

  const hasError =
    progress.updatedDetails === 'error' ||
    progress.removeRoles === 'error' ||
    progress.addRoles === 'error';

  const hasSuccess =
    progress.updatedDetails === 'success' &&
    progress.removeRoles === 'success' &&
    progress.addRoles === 'success';

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

  const removeRoles = async (roles: UserRole[]) => {
    const removePromises = roles.map((role) =>
      fetch(`/api/workspaces/${wsId}/users/${user.id}/roles/${role.id}`, {
        method: 'DELETE',
      })
    );

    const res = await Promise.all(removePromises);

    if (res.every((res) => res.ok)) {
      setProgress((progress) => ({ ...progress, removeRoles: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể xoá các vai trò',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, removeRoles: 'error' }));
      return false;
    }
  };

  const addRoles = async (roles: UserRole[]) => {
    const res = await fetch(`/api/workspaces/${wsId}/users/${user.id}/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roles }),
    });

    if (res) {
      setProgress((progress) => ({ ...progress, addRoles: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể thêm các vai trò',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, addRoles: 'error' }));
      return false;
    }
  };

  const rolesToRemove = oldRoles.filter(
    (oldRole) => !roles.find((role) => role.id === oldRole.id)
  );

  const rolesToAdd = roles.filter(
    (role) => !oldRoles.find((oldRole) => role.id === oldRole.id)
  );

  const handleEdit = async () => {
    if (!user.id) return;

    setProgress((progress) => ({ ...progress, updateDetails: 'loading' }));
    await updateDetails();

    mutate(`/api/workspaces/${wsId}/users/${user.id}`);

    setProgress((progress) => ({ ...progress, removeRoles: 'loading' }));
    if (rolesToRemove.length) await removeRoles(rolesToRemove);
    else setProgress((progress) => ({ ...progress, removeRoles: 'success' }));

    setProgress((progress) => ({ ...progress, addRoles: 'loading' }));
    if (rolesToAdd.length) await addRoles(rolesToAdd);
    else setProgress((progress) => ({ ...progress, addRoles: 'success' }));

    mutate(`/api/workspaces/${wsId}/users/${user.id}/roles`);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.addRoles === 'success'
            ? 3
            : progress.removeRoles === 'success'
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
          title={`Xoá vai trò (${rolesToRemove?.length || 0})`}
        >
          {progress.removeRoles === 'success' ? (
            <div className="text-green-300">
              Đã xoá {rolesToRemove.length} vai trò
            </div>
          ) : progress.removeRoles === 'error' ? (
            <div className="text-red-300">Không thể xoá vai trò</div>
          ) : progress.removeRoles === 'loading' ? (
            <div className="text-blue-300">
              Đang xoá {rolesToRemove.length} vai trò
            </div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ xoá vai trò</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Thêm vai trò (${rolesToAdd?.length || 0})`}
        >
          {progress.addRoles === 'success' ? (
            <div className="text-green-300">
              Đã thêm {rolesToAdd.length} vai trò
            </div>
          ) : progress.addRoles === 'error' ? (
            <div className="text-red-300">Không thể thêm vai trò</div>
          ) : progress.addRoles === 'loading' ? (
            <div className="text-blue-300">
              Đang thêm {rolesToAdd.length} vai trò
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
