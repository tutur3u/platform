import { Timeline } from '@mantine/core';
import { useEffect, useState } from 'react';
import { CheckBadgeIcon, PlusIcon } from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import { useRouter } from 'next/router';
import { Status } from '../../status';
import { Transaction } from '../../../../types/primitives/Transaction';
import { WalletTransfer } from '../../../../types/primitives/WalletTransfer';
import { Wallet } from '../../../../types/primitives/Wallet';

interface Props {
  wsId: string;
  originWallet: Wallet;
  destinationWallet: Wallet;
  transaction: Partial<Transaction>;
  redirectUrl?: string;
}

interface Progress {
  createdWithdrawTransaction: Status;
  createdDepositTransaction: Status;
  createdWalletTransfer: Status;
}

const WalletTransferCreateModal = ({
  wsId,
  originWallet,
  destinationWallet,
  transaction,
  redirectUrl,
}: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    createdWithdrawTransaction: 'idle',
    createdDepositTransaction: 'idle',
    createdWalletTransfer: 'idle',
  });

  const hasError =
    progress.createdWithdrawTransaction === 'error' ||
    progress.createdDepositTransaction === 'error' ||
    progress.createdWalletTransfer === 'error';

  const hasSuccess =
    progress.createdWithdrawTransaction === 'success' &&
    progress.createdDepositTransaction === 'success' &&
    progress.createdWalletTransfer === 'success';

  useEffect(() => {
    if (hasSuccess)
      showNotification({
        title: 'Thành công',
        message: 'Đã tạo giao dịch',
        color: 'green',
      });
  }, [hasSuccess]);

  const createTransaction = async (
    walletId: string,
    transaction: Transaction
  ) => {
    const res = await fetch(
      `/api/workspaces/${wsId}/finance/wallets/${walletId}/transactions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transaction),
      }
    );

    if (res.ok) {
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo giao dịch',
        color: 'red',
      });
      return false;
    }
  };

  const createWalletTransfer = async (transfer: WalletTransfer) => {
    const res = await fetch(
      `/api/workspaces/${wsId}/finance/wallets/transfers`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transfer),
      }
    );

    if (res.ok) {
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo liên kết giao dịch',
        color: 'red',
      });
      return false;
    }
  };

  const handleCreate = async () => {
    setProgress((progress) => ({
      ...progress,
      createdWithdrawTransaction: 'loading',
      createdDepositTransaction: 'loading',
    }));

    if (!originWallet?.id || !destinationWallet?.id) return;

    const withdrawPromise = createTransaction(originWallet.id, {
      ...transaction,
      amount: -(transaction?.amount || 0),
      description: `Rút tiền từ nguồn tiền ${originWallet.name}`,
    });

    const depositPromise = createTransaction(destinationWallet.id, {
      ...transaction,
      amount: transaction?.amount || 0,
      description: `Nhận tiền từ nguồn tiền ${originWallet.name}`,
    });

    const [withdrawId, depositId] = await Promise.all([
      withdrawPromise,
      depositPromise,
    ]);

    if (withdrawId && depositId) {
      setProgress((progress) => ({
        ...progress,
        createdWithdrawTransaction: 'success',
        createdDepositTransaction: 'success',
      }));

      const walletTransferPromise = createWalletTransfer({
        from_transaction_id: withdrawId,
        to_transaction_id: depositId,
      });

      if (await walletTransferPromise) {
        setProgress((progress) => ({
          ...progress,
          createdWalletTransfer: 'success',
        }));
        closeAllModals();
        if (redirectUrl) router.push(redirectUrl);
      } else {
        setProgress((progress) => ({
          ...progress,
          createdWalletTransfer: 'error',
        }));
      }
    } else {
      setProgress((progress) => ({
        ...progress,
        createdWithdrawTransaction: 'error',
        createdDepositTransaction: 'error',
        createdWalletTransfer: 'error',
      }));
    }
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.createdWalletTransfer === 'success'
            ? 3
            : progress.createdDepositTransaction === 'success'
            ? 2
            : progress.createdWithdrawTransaction === 'success'
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
          title="Tạo giao dịch rút tiền"
        >
          {progress.createdWithdrawTransaction === 'success' ? (
            <div className="text-green-300">Đã tạo giao dịch</div>
          ) : progress.createdWithdrawTransaction === 'error' ? (
            <div className="text-red-300">Không thể tạo giao dịch</div>
          ) : progress.createdWithdrawTransaction === 'loading' ? (
            <div className="text-blue-300">Đang tạo giao dịch</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ tạo giao dịch</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<PlusIcon className="h-5 w-5" />}
          title="Tạo giao dịch nhận tiền"
        >
          {progress.createdDepositTransaction === 'success' ? (
            <div className="text-green-300">Đã tạo giao dịch</div>
          ) : progress.createdDepositTransaction === 'error' ? (
            <div className="text-red-300">Không thể tạo giao dịch</div>
          ) : progress.createdDepositTransaction === 'loading' ? (
            <div className="text-blue-300">Đang tạo giao dịch</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ tạo giao dịch</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<PlusIcon className="h-5 w-5" />}
          title="Liên kết giao dịch"
        >
          {progress.createdWalletTransfer === 'success' ? (
            <div className="text-green-300">Đã tạo liên kết giao dịch</div>
          ) : progress.createdWalletTransfer === 'error' ? (
            <div className="text-red-300">Không thể tạo liên kết giao dịch</div>
          ) : progress.createdWalletTransfer === 'loading' ? (
            <div className="text-blue-300">Đang tạo liên kết giao dịch</div>
          ) : (
            <div className="text-zinc-400/80">
              Đang chờ tạo liên kết giao dịch
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title="Hoàn tất"
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.createdWalletTransfer === 'success' ? (
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
              if (redirectUrl) router.push(redirectUrl);
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

export default WalletTransferCreateModal;
