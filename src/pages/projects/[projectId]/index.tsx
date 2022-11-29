import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../components/layout/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';

const ProjectOverviewPage = () => {
  const router = useRouter();
  const { projectId } = router.query;

  const { data: project } = useSWR(
    projectId ? `/api/projects/${projectId}` : null
  );

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      [
        {
          content: project?.orgs?.name || 'Unnamed Organization',
          href: `/orgs/${project?.orgs?.id}`,
        },
        {
          content: project?.name || 'Untitled',
          href: `/projects/${projectId}`,
        },
        { content: 'Overview', href: `/projects/${projectId}` },
      ],
      [project?.orgs?.id]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, project]);

  return (
    <div className="grid gap-4">
      <div className="p-4 bg-zinc-900 rounded-lg">
        <h1 className="font-bold">Overview</h1>
        <p className="text-zinc-400">
          This is the overview page for the{' '}
          <span className="text-white font-semibold">{project?.name}</span>{' '}
          project.
        </p>
      </div>
    </div>
  );
};

ProjectOverviewPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout orgMode={false}>{page}</NestedLayout>;
};

export default ProjectOverviewPage;
