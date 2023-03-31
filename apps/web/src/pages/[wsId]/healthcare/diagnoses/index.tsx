import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Divider, Pagination, Switch, TextInput } from '@mantine/core';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import ModeSelector, {
  Mode,
} from '../../../../components/selectors/ModeSelector';
import PlusCardButton from '../../../../components/common/PlusCardButton';
import { useLocalStorage } from '@mantine/hooks';
import GeneralItemCard from '../../../../components/cards/GeneralItemCard';
import { Diagnosis } from '../../../../types/primitives/Diagnosis';
import useSWR from 'swr';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';

export const getServerSideProps = enforceHasWorkspaces;

const PatientsDiagnosesPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

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
              content: 'Chẩn đoán',
              href: `/${ws.id}/healthcare/diagnoses`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const apiPath = `/api/workspaces/${ws?.id}/healthcare/diagnoses`;
  const { data: diagnoses } = useSWR<Diagnosis[]>(ws?.id ? apiPath : null);

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'healthcare-diagnoses-mode',
    defaultValue: 'grid',
  });

  const [showDescription, setShowDescription] = useLocalStorage({
    key: 'healthcare-diagnoses-showDescription',
    defaultValue: false,
  });

  const [showNote, setShowNote] = useLocalStorage({
    key: 'healthcare-diagnoses-showNote',
    defaultValue: false,
  });

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  if (!ws) return null;

  return (
    <>
      <HeaderX label="Chẩn đoán – Khám bệnh" />
      <div className="flex min-h-full w-full flex-col pb-8">
        <div className="mt-2 grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <TextInput
            label="Tìm kiếm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nhập từ khoá để tìm kiếm"
            icon={<MagnifyingGlassIcon className="h-5" />}
            classNames={{
              input: 'bg-white/5 border-zinc-300/20 font-semibold',
            }}
          />
          <ModeSelector mode={mode} setMode={setMode} />
          <div className="col-span-2 hidden xl:block" />
          <Divider variant="dashed" className="col-span-full" />
          <Switch
            label="Hiển thị mô tả"
            checked={showDescription}
            onChange={(event) =>
              setShowDescription(event.currentTarget.checked)
            }
          />
          <Switch
            label="Hiển thị ghi chú"
            checked={showNote}
            onChange={(event) => setShowNote(event.currentTarget.checked)}
          />
        </div>

        <Divider className="mt-4" />
        <div className="flex items-center justify-center py-4 text-center">
          <Pagination value={activePage} onChange={setPage} total={10} noWrap />
        </div>

        <div
          className={`grid gap-4 ${
            mode === 'grid' && 'md:grid-cols-2 xl:grid-cols-4'
          }`}
        >
          <PlusCardButton href={`/${ws.id}/healthcare/diagnoses/new`} />

          {diagnoses &&
            diagnoses?.map((d) => (
              <GeneralItemCard
                key={d.id}
                name={d.name}
                href={`/${ws.id}/healthcare/diagnoses/${d.id}`}
                secondaryLabel={d.description}
                tertiaryLabel={d.note}
                showSecondaryLabel={showDescription}
                showTertiaryLabel={showNote}
              />
            ))}
        </div>
      </div>
    </>
  );
};

PatientsDiagnosesPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="healthcare">{page}</NestedLayout>;
};

export default PatientsDiagnosesPage;
