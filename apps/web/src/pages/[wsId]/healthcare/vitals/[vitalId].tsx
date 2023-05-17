import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Divider, TextInput } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { useRouter } from 'next/router';
import { Vital } from '../../../../types/primitives/Vital';
import useSWR from 'swr';
import VitalEditModal from '../../../../components/loaders/vitals/VitalEditModal';
import VitalDeleteModal from '../../../../components/loaders/vitals/VitalDeleteModal';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import { useSegments } from '../../../../hooks/useSegments';

export const getServerSideProps = enforceHasWorkspaces;

const NewVitalPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const router = useRouter();
  const { wsId, vitalId } = router.query;

  const apiPath =
    wsId && vitalId
      ? `/api/workspaces/${wsId}/healthcare/vitals/${vitalId}`
      : null;

  const { data: vital } = useSWR<Vital>(apiPath);

  useEffect(() => {
    setRootSegment(
      ws && vital
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: 'Khám bệnh', href: `/${ws.id}/healthcare` },
            {
              content: 'Chỉ số',
              href: `/${ws.id}/healthcare/vitals`,
            },
            {
              content: vital?.name || 'Chỉ số mới',
              href: `/${ws.id}/healthcare/vitals/${vital.id}`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, vital, setRootSegment]);

  const [name, setName] = useState<string>('');
  const [unit, setUnit] = useState<string>('');

  useEffect(() => {
    if (!vital) return;
    setName(vital?.name || '');
    setUnit(vital?.unit || '');
  }, [vital]);

  const hasRequiredFields = () => vital && name.length > 0;

  const showEditModal = () => {
    if (!vital) return;
    if (typeof vitalId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">Cập nhật chỉ số</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <VitalEditModal
          wsId={ws.id}
          vital={{
            id: vitalId,
            name,
            unit,
          }}
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!vital) return;
    if (typeof vitalId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">Xóa chỉ số</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <VitalDeleteModal wsId={ws.id} vitalId={vitalId} />,
    });
  };

  return (
    <>
      <HeaderX label="Chỉ số mới - Khám bệnh" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-20">
        <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
          <div className="flex items-end justify-end gap-2">
            <button
              className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
                vital ? 'hover:bg-red-300/20' : 'cursor-not-allowed opacity-50'
              }`}
              onClick={vital ? showDeleteModal : undefined}
            >
              Xoá
            </button>

            <button
              className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
                hasRequiredFields()
                  ? 'hover:bg-blue-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={hasRequiredFields() ? showEditModal : undefined}
            >
              Lưu thay đổi
            </button>
          </div>
        </div>

        <Divider className="my-4" />
        <div className="grid h-fit gap-x-4 gap-y-2 md:grid-cols-2">
          <div className="col-span-full">
            <div className="text-2xl font-semibold">Thông tin cơ bản</div>
            <Divider className="my-2" variant="dashed" />
          </div>

          <TextInput
            label="Tên chỉ số"
            placeholder='Ví dụ: "Nhiệt độ", "Huyết áp", "Huyết đường", "Cholesterol", "Triglyceride", "Creatinine"'
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
            disabled={!vital}
          />

          <div />

          <TextInput
            label="Đơn vị tính"
            placeholder='Ví dụ: "°C", "mmHg", "mg/dl", "mg", "ml", "mg/kg"'
            value={unit}
            onChange={(e) => setUnit(e.currentTarget.value)}
            disabled={!vital}
          />
        </div>
      </div>
    </>
  );
};

NewVitalPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewVitalPage;
