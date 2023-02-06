import { LinkIcon } from '@heroicons/react/20/solid';
import { useRouter } from 'next/router';
import React, { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { useAppearance } from '../../../../hooks/useAppearance';
import HeaderX from '../../../../components/metadata/HeaderX';

const ProjectBoardsPage = () => {
  const router = useRouter();
  const { projectId } = router.query;

  const { data: project } = useSWR(
    projectId ? `/api/projects/${projectId}` : null
  );

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      project?.orgs?.id
        ? [
            {
              content: project?.orgs?.name || 'Unnamed Organization',
              href: `/orgs/${project.orgs.id}`,
            },
            {
              content: 'Projects',
              href: `/orgs/${project?.orgs?.id}/projects`,
            },
            {
              content: project?.name || 'Untitled Project',
              href: `/projects/${projectId}`,
            },
            { content: 'Boards', href: `/projects/${projectId}/boards` },
          ]
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, project?.orgs?.id, project?.orgs?.name, project?.name]);

  return (
    <>
      <HeaderX
        label={`Boards – ${project?.name || 'Untitled Project'}`}
        disableBranding
      />

      <div className="grid gap-4">
        {projectId && (
          <div className="mt-2 mb-2 flex items-center justify-between">
            <h1 className="text-lg font-bold md:text-xl lg:text-2xl xl:text-3xl">
              Boards
            </h1>
            <button
              // onClick={showProjectEditForm}
              className="flex items-center gap-1 rounded bg-blue-300/20 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-300/10"
            >
              Link board <LinkIcon className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </>
  );
};

ProjectBoardsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout orgMode={false}>{page}</NestedLayout>;
};

export default ProjectBoardsPage;
