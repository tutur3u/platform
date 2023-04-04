import { Timeline } from '@mantine/core';
import { useEffect, useState } from 'react';
import { CheckBadgeIcon, PlusIcon } from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import { useRouter } from 'next/router';
import { Status } from '../status';
import { UserRole } from '../../../types/primitives/UserRole';
import { mutate } from 'swr';

interface Props {
  wsId: string;
  userId: string;
  roles: UserRole[];
}

interface Progress {
  removeRoles: Status;
  removeDetails: Status;
}

const WorkspaceUserDeleteModal = ({ wsId, userId, roles }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    removeRoles: 'idle',
    removeDetails: 'idle',
  });

  const hasError =
    progress.removeRoles === 'error' || progress.removeDetails === 'error';

  const hasSuccess =
    progress.removeRoles === 'success' && progress.removeDetails === 'success';

  useEffect(() => {
    if (!hasSuccess) return;

    showNotification({
      title: 'Thành công',
      message: 'Đã xoá người dùng',
      color: 'green',
    });
  }, [hasSuccess, userId]);

  const removeRoles = async (roles: UserRole[]) => {
    const removePromises = roles.map((r) =>
      fetch(`/api/workspaces/${wsId}/users/${userId}/roles/${r.id}`, {
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

  const removeDetails = async () => {
    const res = await fetch(`/api/workspaces/${wsId}/users/${userId}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      setProgress((progress) => ({ ...progress, removeDetails: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể xoá người dùng',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, removeDetails: 'error' }));
      return false;
    }
  };

  const handleDelete = async () => {
    if (!userId) return;

    setProgress((progress) => ({ ...progress, removeRoles: 'loading' }));
    if (roles.length) await removeRoles(roles);
    else setProgress((progress) => ({ ...progress, removeRoles: 'success' }));
    mutate(`/api/workspaces/${wsId}/users/${userId}/roles`);

    setProgress((progress) => ({ ...progress, removeDetails: 'loading' }));
    await removeDetails();
    mutate(`/api/workspaces/${wsId}/users/${userId}`);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.removeDetails === 'success'
            ? 2
            : progress.removeRoles === 'success'
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
          title={`Xoá vai trò (${roles?.length || 0})`}
        >
          {progress.removeRoles === 'success' ? (
            <div className="text-green-300">
              Đã xoá {roles?.length || 0} vai trò
            </div>
          ) : progress.removeRoles === 'error' ? (
            <div className="text-red-300">
              Không thể xoá {roles?.length || 0} vai trò
            </div>
          ) : progress.removeRoles === 'loading' ? (
            <div className="text-blue-300">
              Đang xoá {roles?.length || 0} vai trò
            </div>
          ) : (
            <div className="text-zinc-400/80">
              Đang chờ xoá {roles?.length || 0} vai trò
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<PlusIcon className="h-5 w-5" />}
          title="Xoá người dùng"
        >
          {progress.removeDetails === 'success' ? (
            <div className="text-green-300">Đã xoá người dùng</div>
          ) : progress.removeDetails === 'error' ? (
            <div className="text-red-300">Không thể xoá người dùng</div>
          ) : progress.removeDetails === 'loading' ? (
            <div className="text-blue-300">Đang xoá người dùng</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ xoá người dùng</div>
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
              router.push(`/${wsId}/users/list`);
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

export default WorkspaceUserDeleteModal;
