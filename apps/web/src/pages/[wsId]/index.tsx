import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../components/layouts/NestedLayout';
import HeaderX from '../../components/metadata/HeaderX';
import { Divider } from '@mantine/core';
import { enforceHasWorkspaces } from '../../utils/serverless/enforce-has-workspaces';
import { useSegments } from '../../hooks/useSegments';
import useTranslation from 'next-translate/useTranslation';

export const getServerSideProps = enforceHasWorkspaces;

const WorkspaceHomePage = () => {
  const { t } = useTranslation('ws-home');

  const loadingLabel = t('common:loading');
  const homeLabel = t('workspace-tabs:home');

  const router = useRouter();

  const { wsId } = router.query;

  const { data, error } = useSWR(wsId ? `/api/workspaces/${wsId}` : null);

  const isLoading = !data && !error;

  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment(
      [
        {
          content: data?.name ?? loadingLabel,
          href: `/${data?.id}`,
        },
        {
          content: homeLabel,
          href: `/${data?.id}`,
        },
      ],
      [data?.id]
    );

    return () => {
      setRootSegment([]);
    };
  }, [setRootSegment, data?.id, data?.name, homeLabel, loadingLabel]);

  if (isLoading) return <div>{loadingLabel}</div>;

  return (
    <div className="pb-20">
      <HeaderX label={`${homeLabel} – ${data?.name}`} />

      {wsId && (
        <>
          <div className="rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900">
            <h1 className="text-2xl font-bold">{homeLabel}</h1>
            <p className="text-zinc-700 dark:text-zinc-400">
              {t('description_p1')}{' '}
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                {data?.name || 'Unnamed Workspace'}
              </span>{' '}
              {t('description_p2')}
            </p>
          </div>
          <Divider className="my-4" />
        </>
      )}
    </div>
  );
};

WorkspaceHomePage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="workspace">{page}</NestedLayout>;
};

export default WorkspaceHomePage;
