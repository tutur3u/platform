import { PlusIcon } from '@heroicons/react/24/solid';
import { useRouter } from 'next/router';
import React, { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../../components/layout/NestedLayout';
import { useAppearance } from '../../../../hooks/useAppearance';

const ProjectBoardsPage = () => {
  const router = useRouter();
  const { projectId } = router.query;

  const { data: project } = useSWR(
    projectId ? `/api/projects/${projectId}` : null
  );

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      project
        ? [
            {
              content: project?.orgs?.name || 'Unnamed Organization',
              href: `/orgs/${project.orgs.id}`,
            },
            {
              content: project?.name || 'Untitled',
              href: `/projects/${projectId}`,
            },
            { content: 'Task Boards', href: `/projects/${projectId}/boards` },
          ]
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, project]);

  return (
    <div className="grid gap-4">
      {projectId && (
        <div className="flex justify-between items-center mt-2 mb-2">
          <h1 className="font-bold text-lg md:text-xl lg:text-2xl xl:text-3xl">
            Task Boards (0)
          </h1>
          <button
            // onClick={showProjectEditForm}
            className="px-4 py-2 font-semibold rounded flex gap-1 bg-blue-300/20 text-blue-300 hover:bg-blue-300/10 transition"
          >
            New board <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

ProjectBoardsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout orgMode={false}>{page}</NestedLayout>;
};

export default ProjectBoardsPage;
