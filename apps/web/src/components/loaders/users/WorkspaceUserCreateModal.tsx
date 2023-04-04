import { Timeline } from '@mantine/core';
import { useEffect, useState } from 'react';
import {
  BanknotesIcon,
  CheckBadgeIcon,
  PlusIcon,
} from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Status } from '../status';
import { WorkspaceUser } from '../../../types/primitives/WorkspaceUser';
import { UserRole } from '../../../types/primitives/UserRole';

interface Props {
  wsId: string;
  user: Partial<WorkspaceUser>;
  roles: UserRole[];
}

interface Progress {
  createdUser: Status;
  createdRoles: Status;
}

const WorkspaceUserCreateModal = ({ wsId, user, roles }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    createdUser: 'idle',
    createdRoles: 'idle',
  });

  const hasError =
    progress.createdUser === 'error' || progress.createdRoles === 'error';

  const hasSuccess =
    progress.createdUser === 'success' && progress.createdRoles === 'success';

  useEffect(() => {
    if (hasSuccess)
      showNotification({
        title: 'Thành công',
        message: 'Đã tạo người dùng',
        color: 'green',
      });
  }, [hasSuccess]);

  const createWorkspaceUser = async () => {
    const res = await fetch(`/api/workspaces/${wsId}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(user),
    });

    if (res.ok) {
      setProgress((progress) => ({ ...progress, createdUser: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo người dùng',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, createdUser: 'error' }));
      return false;
    }
  };

  const createRoles = async (userId: string) => {
    if (roles.length === 0) {
      setProgress((progress) => ({ ...progress, createdRoles: 'success' }));
      return true;
    }

    const res = await fetch(`/api/workspaces/${wsId}/users/${userId}/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roles }),
    });

    if (res.ok) {
      setProgress((progress) => ({ ...progress, createdRoles: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo đơn giá',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, createdRoles: 'error' }));
      return false;
    }
  };

  const [userId, setUserId] = useState<string | null>(null);

  const handleCreate = async () => {
    setProgress((progress) => ({
      ...progress,
      createdUser: 'loading',
    }));
    const prescriptionId = await createWorkspaceUser();
    if (!prescriptionId) return;

    setUserId(prescriptionId);
    setProgress((progress) => ({ ...progress, createdRoles: 'loading' }));
    await createRoles(prescriptionId);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.createdUser === 'success'
            ? 2
            : progress.createdRoles === 'success'
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
          title="Tạo người dùng"
        >
          {progress.createdUser === 'success' ? (
            <div className="text-green-300">Đã tạo người dùng</div>
          ) : progress.createdUser === 'error' ? (
            <div className="text-red-300">Không thể tạo người dùng</div>
          ) : progress.createdUser === 'loading' ? (
            <div className="text-blue-300">Đang tạo người dùng</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ tạo người dùng</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Thêm vai trò (${roles?.length || 0})`}
        >
          {progress.createdUser === 'success' ? (
            progress.createdRoles === 'success' ? (
              <div className="text-green-300">
                Đã thêm {roles.length} vai trò
              </div>
            ) : progress.createdRoles === 'error' ? (
              <div className="text-red-300">Không thể thêm vai trò</div>
            ) : progress.createdRoles === 'loading' ? (
              <div className="text-blue-300">
                Đang thêm {roles.length} vai trò
              </div>
            ) : (
              <div className="text-zinc-400/80">Đang chờ thêm vai trò</div>
            )
          ) : progress.createdUser === 'error' ? (
            <div className="text-red-300">Đã huỷ thêm vai trò</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ thêm người dùng</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title="Hoàn tất"
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.createdRoles === 'success' ? (
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

        {userId && (hasError || hasSuccess) && (
          <Link
            href={`/${wsId}/users/${userId}`}
            onClick={() => closeAllModals()}
            className="rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition hover:bg-blue-300/20"
          >
            Xem người dùng
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
              router.push(`/${wsId}/users/list`);
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

export default WorkspaceUserCreateModal;
