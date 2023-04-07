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
import { Invoice } from '../../../types/primitives/Invoice';
import { Product } from '../../../types/primitives/Product';
import { Transaction } from '../../../types/primitives/Transaction';

interface Props {
  wsId: string;
  invoice: Partial<Invoice>;
  transaction: Partial<Transaction>;
  products: Product[];
}

interface Progress {
  createdTransaction: Status;
  createdInvoice: Status;
  createdProducts: Status;
}

const CreateModal = ({ wsId, invoice, transaction, products }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    createdTransaction: 'idle',
    createdInvoice: 'idle',
    createdProducts: 'idle',
  });

  const hasError =
    progress.createdTransaction === 'error' ||
    progress.createdInvoice === 'error' ||
    progress.createdProducts === 'error';

  const hasSuccess =
    progress.createdTransaction === 'success' &&
    progress.createdInvoice === 'success' &&
    progress.createdProducts === 'success';

  useEffect(() => {
    if (hasSuccess)
      showNotification({
        title: 'Thành công',
        message: 'Đã tạo hoá đơn',
        color: 'green',
      });
  }, [hasSuccess]);

  const createTransaction = async (transaction: Transaction) => {
    if (!transaction?.wallet_id) {
      setProgress((progress) => ({ ...progress, createdTransaction: 'error' }));
      return;
    }

    const res = await fetch(
      `/api/workspaces/${wsId}/finance/wallets/${transaction.wallet_id}/transactions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transaction),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({
        ...progress,
        createdTransaction: 'success',
      }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo giao dịch',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, createdTransaction: 'error' }));
      return false;
    }
  };

  const createInvoice = async (transactionId: string) => {
    const res = await fetch(`/api/workspaces/${wsId}/finance/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...invoice, transaction_id: transactionId }),
    });

    if (res.ok) {
      setProgress((progress) => ({
        ...progress,
        createdInvoice: 'success',
      }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo hoá đơn',
        color: 'red',
      });
      setProgress((progress) => ({
        ...progress,
        createdInvoice: 'error',
      }));
      return false;
    }
  };

  const createProducts = async (invoiceId: string) => {
    if (products.length === 0) {
      setProgress((progress) => ({ ...progress, createdProducts: 'success' }));
      return true;
    }

    const res = await fetch(
      `/api/workspaces/${wsId}/finance/invoices/${invoiceId}/products`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ products }),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({ ...progress, createdProducts: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo đơn giá',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, createdProducts: 'error' }));
      return false;
    }
  };

  const [invoiceId, setId] = useState<string | null>(null);

  const handleCreateInvoice = async () => {
    setProgress((progress) => ({ ...progress, createdTransaction: 'loading' }));

    const transactionId = await createTransaction(transaction);
    if (!transactionId) return;

    setProgress((progress) => ({
      ...progress,
      createdInvoice: 'loading',
    }));

    const invoiceId = await createInvoice(transactionId);
    if (!invoiceId) return;

    setId(invoiceId);
    setProgress((progress) => ({ ...progress, createdProducts: 'loading' }));
    await createProducts(invoiceId);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.createdProducts === 'success'
            ? 3
            : progress.createdInvoice === 'success'
            ? 2
            : progress.createdTransaction === 'success'
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
          title="Tạo giao dịch"
        >
          {progress.createdTransaction === 'success' ? (
            <div className="text-green-300">Đã tạo giao dịch</div>
          ) : progress.createdTransaction === 'error' ? (
            <div className="text-red-300">Không thể tạo giao dịch</div>
          ) : progress.createdTransaction === 'loading' ? (
            <div className="text-blue-300">Đang tạo giao dịch</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ tạo giao dịch</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<PlusIcon className="h-5 w-5" />}
          title="Tạo hoá đơn"
        >
          {progress.createdInvoice === 'success' ? (
            <div className="text-green-300">Đã tạo hoá đơn</div>
          ) : progress.createdInvoice === 'error' ? (
            <div className="text-red-300">Không thể tạo hoá đơn</div>
          ) : progress.createdInvoice === 'loading' ? (
            <div className="text-blue-300">Đang tạo hoá đơn</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ tạo hoá đơn</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Thêm sản phẩm (${products?.length || 0})`}
        >
          {progress.createdInvoice === 'success' ? (
            progress.createdProducts === 'success' ? (
              <div className="text-green-300">
                Đã thêm {products.length} sản phẩm
              </div>
            ) : progress.createdProducts === 'error' ? (
              <div className="text-red-300">Không thể thêm sản phẩm</div>
            ) : progress.createdProducts === 'loading' ? (
              <div className="text-blue-300">
                Đang thêm {products.length} sản phẩm
              </div>
            ) : (
              <div className="text-zinc-400/80">Đang chờ thêm sản phẩm</div>
            )
          ) : progress.createdInvoice === 'error' ? (
            <div className="text-red-300">Đã huỷ thêm sản phẩm</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ thêm hoá đơn</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title="Hoàn tất"
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.createdProducts === 'success' ? (
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

        {invoiceId && (hasError || hasSuccess) && (
          <Link
            href={`/${wsId}/finance/invoices/${invoiceId}`}
            onClick={() => closeAllModals()}
            className="rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition hover:bg-blue-300/20"
          >
            Xem hoá đơn
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
              router.push(`/${wsId}/finance/invoices`);
              closeAllModals();
              return;
            }

            if (!started) {
              setStarted(true);
              handleCreateInvoice();
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

export default CreateModal;
