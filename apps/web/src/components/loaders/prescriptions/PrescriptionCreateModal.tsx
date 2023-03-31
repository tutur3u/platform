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
import { Prescription } from '../../../types/primitives/Prescription';
import { Product } from '../../../types/primitives/Product';

interface Props {
  wsId: string;
  prescription: Partial<Prescription>;
  products: Product[];
}

interface Progress {
  createdPrescription: Status;
  createdProducts: Status;
}

const PrescriptionCreateModal = ({ wsId, prescription, products }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    createdPrescription: 'idle',
    createdProducts: 'idle',
  });

  const hasError =
    progress.createdPrescription === 'error' ||
    progress.createdProducts === 'error';

  const hasSuccess =
    progress.createdPrescription === 'success' &&
    progress.createdProducts === 'success';

  useEffect(() => {
    if (hasSuccess)
      showNotification({
        title: 'Thành công',
        message: 'Đã tạo đơn thuốc',
        color: 'green',
      });
  }, [hasSuccess]);

  const createPrescription = async () => {
    const res = await fetch(
      `/api/workspaces/${wsId}/healthcare/prescriptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(prescription),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({
        ...progress,
        createdPrescription: 'success',
      }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo đơn thuốc',
        color: 'red',
      });
      setProgress((progress) => ({
        ...progress,
        createdPrescription: 'error',
      }));
      return false;
    }
  };

  const createProducts = async (prescriptionId: string) => {
    if (products.length === 0) {
      setProgress((progress) => ({ ...progress, createdProducts: 'success' }));
      return true;
    }

    const res = await fetch(
      `/api/workspaces/${wsId}/healthcare/prescriptions/${prescriptionId}/products`,
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

  const [prescriptionId, setPrescriptionId] = useState<string | null>(null);

  const handleCreate = async () => {
    setProgress((progress) => ({
      ...progress,
      createdPrescription: 'loading',
    }));
    const prescriptionId = await createPrescription();
    if (!prescriptionId) return;

    setPrescriptionId(prescriptionId);
    setProgress((progress) => ({ ...progress, createdProducts: 'loading' }));
    await createProducts(prescriptionId);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.createdProducts === 'success'
            ? 2
            : progress.createdPrescription === 'success'
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
          title="Tạo đơn thuốc"
        >
          {progress.createdPrescription === 'success' ? (
            <div className="text-green-300">Đã tạo đơn thuốc</div>
          ) : progress.createdPrescription === 'error' ? (
            <div className="text-red-300">Không thể tạo đơn thuốc</div>
          ) : progress.createdPrescription === 'loading' ? (
            <div className="text-blue-300">Đang tạo đơn thuốc</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ tạo đơn thuốc</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Thêm sản phẩm (${products?.length || 0})`}
        >
          {progress.createdPrescription === 'success' ? (
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
          ) : progress.createdPrescription === 'error' ? (
            <div className="text-red-300">Đã huỷ thêm sản phẩm</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ thêm đơn thuốc</div>
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

        {prescriptionId && (hasError || hasSuccess) && (
          <Link
            href={`/${wsId}/healthcare/prescriptions/${prescriptionId}`}
            onClick={() => closeAllModals()}
            className="rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition hover:bg-blue-300/20"
          >
            Xem đơn thuốc
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
              router.push(`/${wsId}/healthcare/prescriptions`);
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

export default PrescriptionCreateModal;
