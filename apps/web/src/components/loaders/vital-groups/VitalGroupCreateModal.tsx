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
import { VitalGroup } from '../../../types/primitives/VitalGroup';
import { Vital } from '../../../types/primitives/Vital';

interface Props {
  wsId: string;
  group: Partial<VitalGroup>;
  vitals: Vital[];
}

interface Progress {
  createdVitalGroup: Status;
  createdVitals: Status;
}

const VitalGroupCreateModal = ({ wsId, group, vitals }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    createdVitalGroup: 'idle',
    createdVitals: 'idle',
  });

  const hasError =
    progress.createdVitalGroup === 'error' ||
    progress.createdVitals === 'error';

  const hasSuccess =
    progress.createdVitalGroup === 'success' &&
    progress.createdVitals === 'success';

  useEffect(() => {
    if (hasSuccess)
      showNotification({
        title: 'Thành công',
        message: 'Đã tạo nhóm chỉ số',
        color: 'green',
      });
  }, [hasSuccess]);

  const createVitalGroup = async () => {
    const res = await fetch(`/api/workspaces/${wsId}/healthcare/vital-groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(group),
    });

    if (res.ok) {
      setProgress((progress) => ({
        ...progress,
        createdVitalGroup: 'success',
      }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo nhóm chỉ số',
        color: 'red',
      });
      setProgress((progress) => ({
        ...progress,
        createdVitalGroup: 'error',
      }));
      return false;
    }
  };

  const createVitals = async (groupId: string) => {
    if (vitals.length === 0) {
      setProgress((progress) => ({ ...progress, createdVitals: 'success' }));
      return true;
    }

    const res = await fetch(
      `/api/workspaces/${wsId}/healthcare/vital-groups/${groupId}/vitals`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vitals }),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({ ...progress, createdVitals: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo đơn giá',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, createdVitals: 'error' }));
      return false;
    }
  };

  const [groupId, setGroupId] = useState<string | null>(null);

  const handleCreate = async () => {
    setProgress((progress) => ({
      ...progress,
      createdVitalGroup: 'loading',
    }));
    const groupId = await createVitalGroup();
    if (!groupId) return;

    setGroupId(groupId);
    setProgress((progress) => ({ ...progress, createdVitals: 'loading' }));
    await createVitals(groupId);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.createdVitals === 'success'
            ? 2
            : progress.createdVitalGroup === 'success'
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
          title="Tạo nhóm chỉ số"
        >
          {progress.createdVitalGroup === 'success' ? (
            <div className="text-green-300">Đã tạo nhóm chỉ số</div>
          ) : progress.createdVitalGroup === 'error' ? (
            <div className="text-red-300">Không thể tạo nhóm chỉ số</div>
          ) : progress.createdVitalGroup === 'loading' ? (
            <div className="text-blue-300">Đang tạo nhóm chỉ số</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ tạo nhóm chỉ số</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Thêm chỉ số (${vitals?.length || 0})`}
        >
          {progress.createdVitalGroup === 'success' ? (
            progress.createdVitals === 'success' ? (
              <div className="text-green-300">
                Đã thêm {vitals.length} chỉ số
              </div>
            ) : progress.createdVitals === 'error' ? (
              <div className="text-red-300">Không thể thêm chỉ số</div>
            ) : progress.createdVitals === 'loading' ? (
              <div className="text-blue-300">
                Đang thêm {vitals.length} chỉ số
              </div>
            ) : (
              <div className="text-zinc-400/80">Đang chờ thêm chỉ số</div>
            )
          ) : progress.createdVitalGroup === 'error' ? (
            <div className="text-red-300">Đã huỷ thêm chỉ số</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ thêm nhóm chỉ số</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title="Hoàn tất"
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.createdVitals === 'success' ? (
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

        {groupId && (hasError || hasSuccess) && (
          <Link
            href={`/${wsId}/healthcare/vital-groups/${groupId}`}
            onClick={() => closeAllModals()}
            className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
          >
            Xem nhóm chỉ số
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
              router.push(`/${wsId}/healthcare/vital-groups`);
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

export default VitalGroupCreateModal;
