import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Divider, TextInput, Textarea } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { Vital } from '../../../../types/primitives/Vital';
import 'dayjs/locale/vi';
import VitalSelector from '../../../../components/selectors/VitalSelector';
import { useRouter } from 'next/router';
import { VitalGroup } from '../../../../types/primitives/VitalGroup';
import useSWR from 'swr';
import { TrashIcon } from '@heroicons/react/24/solid';
import VitalGroupDeleteModal from '../../../../components/loaders/vital-groups/VitalGroupDeleteModal';
import VitalGroupEditModal from '../../../../components/loaders/vital-groups/VitalGroupEditModal';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';

export const getServerSideProps = enforceHasWorkspaces;

const VitalGroupDetailsPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const router = useRouter();
  const { groupId } = router.query;

  const groupApiPath = `/api/workspaces/${ws?.id}/healthcare/vital-groups/${groupId}`;
  const vitalsApiPath = `/api/workspaces/${ws?.id}/healthcare/vital-groups/${groupId}/vitals`;

  const { data: group } = useSWR<VitalGroup>(
    ws?.id && groupId ? groupApiPath : null
  );

  const { data: groupVitals } = useSWR<Vital[]>(
    ws?.id && groupId ? vitalsApiPath : null
  );

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: 'Khám bệnh', href: `/${ws.id}/healthcare` },
            {
              content: 'Nhóm chỉ số',
              href: `/${ws.id}/healthcare/vital-groups`,
            },
            {
              content: 'Tạo mới',
              href: `/${ws.id}/healthcare/vital-groups/new`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (group) {
      setName(group.name || '');
      setDescription(group?.description || null);
      setNote(group?.note || null);
    }
  }, [group]);

  const [vitals, setVitals] = useState<Vital[]>([]);

  useEffect(() => {
    if (groupVitals) setVitals(groupVitals);
  }, [groupVitals]);

  const allVitalsValid = () => vitals.every((vital) => vital.id.length > 0);
  const hasRequiredFields = () => vitals.length > 0 && allVitalsValid();

  const addEmptyVital = () => {
    setVitals((vitals) => [
      ...vitals,
      {
        id: '',
      },
    ]);
  };

  const updateVital = (index: number, vital: Vital | null) => {
    setVitals((vitals) => {
      const newVitals = [...vitals];
      if (newVitals[index]) newVitals[index] = vital || { id: '' };
      return newVitals;
    });
  };

  const removeVital = (index: number) => {
    setVitals((vitals) => {
      const newVitals = [...vitals];
      newVitals.splice(index, 1);
      return newVitals;
    });
  };

  const showEditModal = () => {
    if (!group) return;
    if (typeof groupId !== 'string') return;
    if (!ws?.id) return;
    if (!groupVitals || !vitals) return;

    openModal({
      title: <div className="font-semibold">Cập nhật nhóm chỉ số</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <VitalGroupEditModal
          wsId={ws.id}
          group={{
            id: groupId,
            name,
            description: description || '',
            note: note || '',
          }}
          vitals={vitals}
          oldVitals={groupVitals}
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!group) return;
    if (typeof groupId !== 'string') return;
    if (!ws?.id || !groupVitals) return;

    openModal({
      title: <div className="font-semibold">Xóa nhóm chỉ số</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <VitalGroupDeleteModal
          wsId={ws.id}
          groupId={groupId}
          vitals={groupVitals}
        />
      ),
    });
  };

  return (
    <>
      <HeaderX label="Nhóm chỉ số – Khám bệnh" />
      <div className="mt-2 flex min-h-full w-full flex-col ">
        <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
          <div className="flex items-end justify-end gap-2">
            <button
              className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
                group ? 'hover:bg-red-300/20' : 'cursor-not-allowed opacity-50'
              }`}
              onClick={group ? showDeleteModal : undefined}
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
        <div className="grid gap-x-8 gap-y-4 xl:grid-cols-4 xl:gap-x-16">
          <div className="grid h-fit gap-x-4 gap-y-2 md:grid-cols-2">
            <div className="col-span-full">
              <div className="text-2xl font-semibold">Thông tin cơ bản</div>
              <Divider className="my-2" variant="dashed" />
            </div>

            <TextInput
              label="Tên nhóm chỉ số"
              placeholder="Nhập tên nhóm chỉ số"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              className="md:col-span-2"
            />

            <Divider className="col-span-full my-2" />

            {description != null ? (
              <Textarea
                label="Mô tả"
                placeholder="Nhập mô tả cho nhóm chỉ số này"
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
                className="md:col-span-2"
                minRows={5}
                classNames={{
                  input: 'bg-white/5 border-zinc-300/20 font-semibold',
                }}
              />
            ) : (
              <button
                className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-2 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20 md:col-span-2"
                onClick={() => setDescription('')}
              >
                + Thêm mô tả
              </button>
            )}

            {note != null ? (
              <Textarea
                label="Ghi chú"
                placeholder="Nhập ghi chú cho nhóm chỉ số này"
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                className="md:col-span-2"
                minRows={5}
                classNames={{
                  input: 'bg-white/5 border-zinc-300/20 font-semibold',
                }}
              />
            ) : (
              <button
                className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-2 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20 md:col-span-2"
                onClick={() => setNote('')}
              >
                + Thêm ghi chú
              </button>
            )}
          </div>

          <div className="grid h-fit gap-x-4 gap-y-2 xl:col-span-3">
            <div className="col-span-full">
              <div className="text-2xl font-semibold">
                Chỉ số ({vitals?.length || 0})
              </div>
              <Divider className="mb-4 mt-2" variant="dashed" />

              <button
                className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
                onClick={addEmptyVital}
              >
                + Thêm chỉ số
              </button>
            </div>

            {vitals.map((v, idx) => (
              <div key={`vital-${idx}`} className="flex w-full items-end gap-2">
                <VitalSelector
                  vital={v}
                  setVital={(vital) => updateVital(idx, vital)}
                  blacklist={vitals.map((v) => v.id)}
                  className="w-full"
                />
                <button
                  className="h-fit rounded border border-red-300/10 bg-red-300/10 px-1 py-1.5 font-semibold text-red-300 transition hover:bg-red-300/20"
                  onClick={() => removeVital(idx)}
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

VitalGroupDetailsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default VitalGroupDetailsPage;
