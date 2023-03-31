import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Divider, TextInput, Textarea } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { useRouter } from 'next/router';
import { Diagnosis } from '../../../../types/primitives/Diagnosis';
import useSWR from 'swr';
import DiagnosisEditModal from '../../../../components/loaders/diagnoses/DiagnosisEditModal';
import DiagnosisDeleteModal from '../../../../components/loaders/diagnoses/DiagnosisDeleteModal';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';

export const getServerSideProps = enforceHasWorkspaces;

const NewDiagnosisPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const router = useRouter();
  const { diagnosisId } = router.query;

  const apiPath = `/api/workspaces/${ws?.id}/healthcare/diagnoses/${diagnosisId}`;
  const { data: diagnosis } = useSWR<Diagnosis>(
    ws && diagnosisId ? apiPath : null
  );

  useEffect(() => {
    setRootSegment(
      ws && diagnosis
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: 'Khám bệnh', href: `/${ws.id}/healthcare` },
            {
              content: 'Chẩn đoán',
              href: `/${ws.id}/healthcare/diagnoses`,
            },
            {
              content: diagnosis?.name || 'Chẩn đoán mới',
              href: `/${ws.id}/healthcare/diagnoses/${diagnosis.id}`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, diagnosis, setRootSegment]);

  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [note, setNote] = useState<string>('');

  useEffect(() => {
    if (!diagnosis) return;
    setName(diagnosis.name);
    setDescription(diagnosis?.description || '');
    setNote(diagnosis?.note || '');
  }, [diagnosis]);

  const hasRequiredFields = () => diagnosis && name.length > 0;

  const showEditModal = () => {
    if (!diagnosis) return;
    if (typeof diagnosisId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">Cập nhật bệnh nhân</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <DiagnosisEditModal
          wsId={ws.id}
          diagnosis={{
            id: diagnosisId,
            name,
            description,
            note,
          }}
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!diagnosis) return;
    if (typeof diagnosisId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">Xóa bệnh nhân</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <DiagnosisDeleteModal wsId={ws.id} diagnosisId={diagnosisId} />,
    });
  };

  return (
    <>
      <HeaderX label="Chẩn đoán mới - Khám bệnh" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-8">
        <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
          <div className="flex items-end justify-end gap-2">
            <button
              className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
                diagnosis
                  ? 'hover:bg-red-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={diagnosis ? showDeleteModal : undefined}
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
            classNames={{
              input: 'bg-white/5 border-zinc-300/20 font-semibold',
            }}
            required
            disabled={!diagnosis}
          />

          <div />

          <Textarea
            label="Mô tả"
            placeholder="Mô tả về chẩn đoán"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            minRows={5}
            classNames={{
              input: 'bg-white/5 border-zinc-300/20 font-semibold',
            }}
          />

          <Textarea
            label="Ghi chú"
            placeholder="Ghi chú về chẩn đoán"
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            minRows={5}
            classNames={{
              input: 'bg-white/5 border-zinc-300/20 font-semibold',
            }}
          />
        </div>
      </div>
    </>
  );
};

NewDiagnosisPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewDiagnosisPage;
