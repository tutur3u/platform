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
import { Invoice } from '../../../types/primitives/Invoice';
import { Product } from '../../../types/primitives/Product';
import { Transaction } from '../../../types/primitives/Transaction';

interface Props {
  wsId: string;

  transaction: Transaction;
  invoice: Invoice;

  oldProducts: Product[];
  products: Product[];
}

interface Progress {
  updateTransaction: Status;
  updateDetails: Status;
  updateProducts: Status;
  removeProducts: Status;
  addProducts: Status;
}

const EditModal = ({
  wsId,
  oldProducts,
  transaction,
  invoice,
  products,
}: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    updateTransaction: 'idle',
    updateDetails: 'idle',
    updateProducts: 'idle',
    removeProducts: 'idle',
    addProducts: 'idle',
  });

  const hasError =
    progress.updateTransaction === 'error' ||
    progress.updateDetails === 'error' ||
    progress.updateProducts === 'error' ||
    progress.removeProducts === 'error' ||
    progress.addProducts === 'error';

  const hasSuccess =
    progress.updateTransaction === 'success' &&
    progress.updateDetails === 'success' &&
    progress.updateProducts === 'success' &&
    progress.removeProducts === 'success' &&
    progress.addProducts === 'success';

  useEffect(() => {
    if (!hasSuccess) return;

    mutate(`/api/workspaces/${wsId}/finance/invoices/${invoice.id}`);
    mutate(`/api/invoices/${invoice.id}/products`);

    showNotification({
      title: 'Thành công',
      message: 'Đã cập nhật hoá đơn',
      color: 'green',
    });
  }, [hasSuccess, wsId, invoice.id]);

  const updateTransaction = async (transaction: Transaction) => {
    const res = await fetch(
      `/api/workspaces/${wsId}/finance/transactions/${transaction.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transaction),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({
        ...progress,
        updateTransaction: 'success',
      }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể cập nhật giao dịch',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, updateTransaction: 'error' }));
      return false;
    }
  };

  const updateDetails = async () => {
    const res = await fetch(
      `/api/workspaces/${wsId}/finance/invoices/${invoice.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invoice),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({ ...progress, updateDetails: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể cập nhật hoá đơn',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, updateDetails: 'error' }));
      return false;
    }
  };

  const updateProducts = async (products: Product[]) => {
    const updatePromises = products.map((product) => {
      return fetch(
        `/api/workspaces/${wsId}/finance/invoices/${invoice.id}/products/${product.id}?unitId=${product.unit_id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(product),
        }
      );
    });

    const res = await Promise.all(updatePromises);

    if (res.every((res) => res.ok)) {
      setProgress((progress) => ({ ...progress, updateProducts: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể cập nhật các sản phẩm',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, updateProducts: 'error' }));
      return false;
    }
  };

  const removeProducts = async (products: Product[]) => {
    const removePromises = products.map((product) =>
      fetch(
        `/api/workspaces/${wsId}/finance/invoices/${invoice.id}/products/${product.id}?unitId=${product.unit_id}`,
        {
          method: 'DELETE',
        }
      )
    );

    const res = await Promise.all(removePromises);

    if (res.every((res) => res.ok)) {
      setProgress((progress) => ({ ...progress, removeProducts: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể xoá các sản phẩm',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, removeProducts: 'error' }));
      return false;
    }
  };

  const addProducts = async (products: Product[]) => {
    const res = await fetch(
      `/api/workspaces/${wsId}/finance/invoices/${invoice.id}/products`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ products }),
      }
    );

    if (res) {
      setProgress((progress) => ({ ...progress, addProducts: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể thêm các sản phẩm',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, addProducts: 'error' }));
      return false;
    }
  };

  const productsToUpdate = products.filter((product) =>
    oldProducts.find(
      (oldProduct) =>
        product.id === oldProduct.id && product.unit_id === oldProduct.unit_id
    )
  );

  const productsToRemove = oldProducts.filter(
    (oldProduct) =>
      !products.find(
        (product) =>
          product.id === oldProduct.id && product.unit_id === oldProduct.unit_id
      )
  );

  const productsToAdd = products.filter(
    (product) =>
      !oldProducts.find(
        (oldProduct) =>
          product.id === oldProduct.id && product.unit_id === oldProduct.unit_id
      )
  );

  const handleEdit = async () => {
    if (!invoice.id) return;

    setProgress((progress) => ({ ...progress, updateTransaction: 'loading' }));
    if (!(await updateTransaction(transaction))) return;

    setProgress((progress) => ({ ...progress, updateDetails: 'loading' }));
    await updateDetails();

    mutate(`/api/workspaces/${wsId}/finance/invoices/${invoice.id}`);

    setProgress((progress) => ({ ...progress, updateProducts: 'loading' }));
    if (productsToUpdate.length) await updateProducts(productsToUpdate);
    else
      setProgress((progress) => ({ ...progress, updateProducts: 'success' }));

    setProgress((progress) => ({ ...progress, removeProducts: 'loading' }));
    if (productsToRemove.length) await removeProducts(productsToRemove);
    else
      setProgress((progress) => ({ ...progress, removeProducts: 'success' }));

    setProgress((progress) => ({ ...progress, addProducts: 'loading' }));
    if (productsToAdd.length) await addProducts(productsToAdd);
    else setProgress((progress) => ({ ...progress, addProducts: 'success' }));

    mutate(`/api/workspaces/${wsId}/finance/invoices/${invoice.id}/products`);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.addProducts === 'success'
            ? 5
            : progress.removeProducts === 'success'
            ? 4
            : progress.updateProducts === 'success'
            ? 3
            : progress.updateDetails === 'success'
            ? 2
            : progress.updateTransaction === 'success'
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
          title="Cập nhật giao dịch"
        >
          {progress.updateTransaction === 'success' ? (
            <div className="text-green-300">Đã cập nhật giao dịch</div>
          ) : progress.updateTransaction === 'error' ? (
            <div className="text-red-300">Không thể cập nhật giao dịch</div>
          ) : progress.updateTransaction === 'loading' ? (
            <div className="text-blue-300">Đang cập nhật giao dịch</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ cập nhật giao dịch</div>
          )}
        </Timeline.Item>

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
          title={`Cập nhật sản phẩm (${productsToUpdate?.length || 0})`}
        >
          {progress.updateProducts === 'success' ? (
            <div className="text-green-300">
              Đã cập nhật {productsToUpdate.length} sản phẩm
            </div>
          ) : progress.updateProducts === 'error' ? (
            <div className="text-red-300">Không thể cập nhật sản phẩm</div>
          ) : progress.updateProducts === 'loading' ? (
            <div className="text-blue-300">
              Đang cập nhật {productsToUpdate.length} sản phẩm
            </div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ cập nhật sản phẩm</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Xoá sản phẩm (${productsToRemove?.length || 0})`}
        >
          {progress.removeProducts === 'success' ? (
            <div className="text-green-300">
              Đã xoá {productsToRemove.length} sản phẩm
            </div>
          ) : progress.removeProducts === 'error' ? (
            <div className="text-red-300">Không thể xoá sản phẩm</div>
          ) : progress.removeProducts === 'loading' ? (
            <div className="text-blue-300">
              Đang xoá {productsToRemove.length} sản phẩm
            </div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ xoá sản phẩm</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Thêm sản phẩm (${productsToAdd?.length || 0})`}
        >
          {progress.addProducts === 'success' ? (
            <div className="text-green-300">
              Đã thêm {productsToAdd.length} sản phẩm
            </div>
          ) : progress.addProducts === 'error' ? (
            <div className="text-red-300">Không thể thêm sản phẩm</div>
          ) : progress.addProducts === 'loading' ? (
            <div className="text-blue-300">
              Đang thêm {productsToAdd.length} sản phẩm
            </div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ thêm sản phẩm</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title="Hoàn tất"
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.addProducts === 'success' ? (
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

        {invoice.id && hasSuccess && (
          <button
            className="rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition hover:bg-blue-300/20"
            onClick={() => closeAllModals()}
          >
            Xem hoá đơn
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
              router.push(`/${wsId}/finance/invoices`);
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

export default EditModal;
