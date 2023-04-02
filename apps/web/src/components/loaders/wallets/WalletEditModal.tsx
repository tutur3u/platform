import { Timeline } from '@mantine/core';
import { useEffect, useState } from 'react';
import { CheckBadgeIcon, PlusIcon } from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import { useRouter } from 'next/router';
import { mutate } from 'swr';
import { Status } from '../status';
import { Wallet } from '../../../types/primitives/Wallet';
import { Transaction } from '../../../types/primitives/Transaction';

interface Props {
  wsId: string;
  oldWallet: Wallet;
  wallet: Wallet;
}

interface Progress {
  updateDetails: Status;
  adjustBalance: Status;
}

const WalletEditModal = ({ wsId, oldWallet, wallet }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    updateDetails: 'idle',
    adjustBalance: 'idle',
  });

  const hasError =
    progress.updateDetails === 'error' || progress.adjustBalance === 'error';

  const hasSuccess =
    progress.updateDetails === 'success' &&
    progress.adjustBalance === 'success';

  useEffect(() => {
    if (!hasSuccess) return;

    mutate(`/api/workspaces/${wsId}/finance/wallets/${wallet.id}`);

    showNotification({
      title: 'Thành công',
      message: 'Đã cập nhật nguồn tiền',
      color: 'green',
    });
  }, [hasSuccess, wsId, wallet.id]);

  const updateDetails = async () => {
    const res = await fetch(
      `/api/workspaces/${wsId}/finance/wallets/${wallet.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(wallet),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({ ...progress, updateDetails: 'success' }));
      mutate(`/api/workspaces/${wsId}/finance/wallets/${wallet.id}`);
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể cập nhật nguồn tiền',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, updateDetails: 'error' }));
      return false;
    }
  };

  const adjustBalance = async () => {
    if (wallet?.balance == null || oldWallet?.balance == null) return;

    const res = await fetch(
      `/api/workspaces/${wsId}/finance/wallets/${wallet.id}/transactions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: 'Cân bằng số dư',
          amount: (wallet?.balance || 0) - oldWallet.balance,
        } as Transaction),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({ ...progress, adjustBalance: 'success' }));
      mutate(`/api/workspaces/${wsId}/finance/wallets/${wallet.id}`);
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể cân bằng số dư',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, adjustBalance: 'error' }));
      return false;
    }
  };

  const handleEdit = async () => {
    if (!wallet.id) return;

    setProgress((progress) => ({ ...progress, updateDetails: 'loading' }));
    updateDetails();

    if (wallet.balance !== oldWallet.balance) {
      setProgress((progress) => ({ ...progress, adjustBalance: 'loading' }));
      await adjustBalance();
    } else {
      setProgress((progress) => ({ ...progress, adjustBalance: 'success' }));
    }
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.adjustBalance === 'success'
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
          bullet={<PlusIcon className="h-5 w-5" />}
          title="Cân bằng số dư"
        >
          {progress.updateDetails === 'success' ? (
            <div className="text-green-300">Đã cân bằng số dư</div>
          ) : progress.updateDetails === 'error' ? (
            <div className="text-red-300">Không thể cân bằng số dư</div>
          ) : progress.updateDetails === 'loading' ? (
            <div className="text-blue-300">Đang cân bằng số dư</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ cân bằng số dư</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title="Hoàn tất"
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.updateDetails === 'success' ? (
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

        {wallet.id && hasSuccess && (
          <button
            className="rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition hover:bg-blue-300/20"
            onClick={() => closeAllModals()}
          >
            Xem nguồn tiền
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
              router.push(`/${wsId}/finance/wallets`);
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

export default WalletEditModal;
