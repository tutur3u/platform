import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { useAppearance } from '../../../../hooks/useAppearance';
import HeaderX from '../../../../components/metadata/HeaderX';
import { Divider } from '@mantine/core';

const ProjectOverviewPage = () => {
  const router = useRouter();
  const { projectId } = router.query;

  const { data: project } = useSWR(
    projectId ? `/api/projects/${projectId}` : null
  );

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      project?.workspaces?.id
        ? [
            {
              content: project?.workspaces?.name || 'Unnamed Workspace',
              href: `/${project?.workspaces?.id}`,
            },
            {
              content: 'Projects',
              href: `/${project?.workspaces?.id}/projects`,
            },
            {
              content: project?.name || 'Untitled Project',
              href: `/${project?.workspaces?.id}/projects/${projectId}`,
            },
            {
              content: 'Overview',
              href: `/${project?.workspaces?.id}/projects/${projectId}`,
            },
          ]
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectId,
    project?.workspaces?.id,
    project?.workspaces?.name,
    project?.name,
  ]);

  return (
    <>
      <HeaderX label={`Overview – ${project?.name || 'Untitled Project'}`} />

      {projectId && (
        <>
          <div className="rounded-lg bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">Overview</h1>
            <p className="text-zinc-400">
              A quick summary of the{' '}
              <span className="font-semibold text-zinc-200">
                {project?.name || 'Untitled Project'}
              </span>{' '}
              project and its progress.
            </p>
          </div>
        </>
      )}

      <Divider className="my-4" />
    </>
  );
};

ProjectOverviewPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="project">{page}</NestedLayout>;
};

export default ProjectOverviewPage;
