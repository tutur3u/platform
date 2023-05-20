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
import { Checkup } from '../../../types/primitives/Checkup';
import { Vital } from '../../../types/primitives/Vital';
import { VitalGroup } from '../../../types/primitives/VitalGroup';

interface Props {
  wsId: string;
  checkup: Partial<Checkup>;
  vitals: Vital[];
  groups: VitalGroup[];
}

interface Progress {
  createdCheckup: Status;
  createdVitals: Status;
  createdGroups: Status;
}

const CheckupCreateModal = ({ wsId, checkup, vitals, groups }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    createdCheckup: 'idle',
    createdVitals: 'idle',
    createdGroups: 'idle',
  });

  const hasError =
    progress.createdCheckup === 'error' ||
    progress.createdVitals === 'error' ||
    progress.createdGroups === 'error';

  const hasSuccess =
    progress.createdCheckup === 'success' &&
    progress.createdVitals === 'success' &&
    progress.createdGroups === 'success';

  useEffect(() => {
    if (hasSuccess)
      showNotification({
        title: 'Thành công',
        message: 'Đã tạo đơn kiểm tra sức khoẻ',
        color: 'green',
      });
  }, [hasSuccess]);

  const createCheckup = async () => {
    const res = await fetch(`/api/workspaces/${wsId}/healthcare/checkups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(checkup),
    });

    if (res.ok) {
      setProgress((progress) => ({
        ...progress,
        createdCheckup: 'success',
      }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo đơn kiểm tra sức khoẻ',
        color: 'red',
      });
      setProgress((progress) => ({
        ...progress,
        createdCheckup: 'error',
      }));
      return false;
    }
  };

  const createVitals = async (checkupId: string) => {
    if (vitals.length === 0) {
      setProgress((progress) => ({ ...progress, createdVitals: 'success' }));
      return true;
    }

    const res = await fetch(
      `/api/workspaces/${wsId}/healthcare/checkups/${checkupId}/vitals`,
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
        message: 'Không thể thêm chỉ số',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, createdVitals: 'error' }));
      return false;
    }
  };

  const createGroups = async (checkupId: string) => {
    if (groups.length === 0) {
      setProgress((progress) => ({ ...progress, createdGroups: 'success' }));
      return true;
    }

    const res = await fetch(
      `/api/workspaces/${wsId}/healthcare/checkups/${checkupId}/vital-groups`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ groups }),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({ ...progress, createdGroups: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể thêm nhóm chỉ số',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, createdGroups: 'error' }));
      return false;
    }
  };

  const [checkupId, setCheckupId] = useState<string | null>(null);

  const handleCreate = async () => {
    setProgress((progress) => ({
      ...progress,
      createdCheckup: 'loading',
    }));
    const checkupId = await createCheckup();
    if (!checkupId) return;

    setCheckupId(checkupId);

    setProgress((progress) => ({ ...progress, createdVitals: 'loading' }));
    setProgress((progress) => ({ ...progress, createdGroups: 'loading' }));
    await Promise.all([createVitals(checkupId), createGroups(checkupId)]);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.createdGroups === 'success'
            ? 3
            : progress.createdVitals === 'success'
            ? 2
            : progress.createdCheckup === 'success'
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
          title="Tạo đơn kiểm tra sức khoẻ"
        >
          {progress.createdCheckup === 'success' ? (
            <div className="text-green-300">Đã tạo đơn kiểm tra sức khoẻ</div>
          ) : progress.createdCheckup === 'error' ? (
            <div className="text-red-300">
              Không thể tạo đơn kiểm tra sức khoẻ
            </div>
          ) : progress.createdCheckup === 'loading' ? (
            <div className="text-blue-300">Đang tạo đơn kiểm tra sức khoẻ</div>
          ) : (
            <div className="text-zinc-400/80">
              Đang chờ tạo đơn kiểm tra sức khoẻ
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Thêm chỉ số (${vitals?.length || 0})`}
        >
          {progress.createdCheckup === 'success' ? (
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
          ) : progress.createdCheckup === 'error' ? (
            <div className="text-red-300">Đã huỷ thêm chỉ số</div>
          ) : (
            <div className="text-zinc-400/80">
              Đang chờ thêm đơn kiểm tra sức khoẻ
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Thêm nhóm chỉ số (${groups?.length || 0})`}
        >
          {progress.createdCheckup === 'success' ? (
            progress.createdGroups === 'success' ? (
              <div className="text-green-300">
                Đã thêm {groups.length} nhóm chỉ số
              </div>
            ) : progress.createdGroups === 'error' ? (
              <div className="text-red-300">Không thể thêm nhóm chỉ số</div>
            ) : progress.createdGroups === 'loading' ? (
              <div className="text-blue-300">
                Đang thêm {groups.length} nhóm chỉ số
              </div>
            ) : (
              <div className="text-zinc-400/80">Đang chờ thêm nhóm chỉ số</div>
            )
          ) : progress.createdCheckup === 'error' ? (
            <div className="text-red-300">Đã huỷ thêm nhóm chỉ số</div>
          ) : (
            <div className="text-zinc-400/80">
              Đang chờ thêm đơn kiểm tra sức khoẻ
            </div>
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

        {checkupId && (hasError || hasSuccess) && (
          <Link
            href={`/${wsId}/healthcare/checkups/${checkupId}`}
            onClick={() => closeAllModals()}
            className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
          >
            Xem đơn kiểm tra sức khoẻ
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
              router.push(`/${wsId}/healthcare/checkups`);
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

export default CheckupCreateModal;
