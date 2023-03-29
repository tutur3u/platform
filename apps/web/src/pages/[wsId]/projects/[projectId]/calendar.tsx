import { useRouter } from 'next/router';
import React, { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { useAppearance } from '../../../../hooks/useAppearance';
import HeaderX from '../../../../components/metadata/HeaderX';
import { Divider } from '@mantine/core';

const ProjectCalendarPage = () => {
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
              href: `/workspaces/${project.workspaces.id}`,
            },
            {
              content: 'Projects',
              href: `/workspaces/${project?.workspaces?.id}/projects`,
            },
            {
              content: project?.name || 'Untitled Project',
              href: `/projects/${projectId}`,
            },
            { content: 'Calendar', href: `/projects/${projectId}/calendar` },
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
      <HeaderX label={`Calendar – ${project?.name || 'Untitled Project'}`} />

      {projectId && (
        <>
          <div className="rounded-lg bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">Calendar</h1>
            <p className="text-zinc-400">
              Organize tasks, events, and deadlines effectively and
              collaboratively with a calendar.
            </p>
          </div>
        </>
      )}

      <Divider className="my-4" />
    </>
  );
};

ProjectCalendarPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="project">{page}</NestedLayout>;
};

export default ProjectCalendarPage;
