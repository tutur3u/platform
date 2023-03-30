import { SquaresPlusIcon } from '@heroicons/react/24/solid';
import { openModal } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useSegments } from '../../../hooks/useSegments';
import { Project } from '../../../types/primitives/Project';
import moment from 'moment';
import ProjectEditForm from '../../../components/forms/ProjectEditForm';
import HeaderX from '../../../components/metadata/HeaderX';
import { Divider } from '@mantine/core';

const WorkspaceProjectsPage = () => {
  const router = useRouter();
  const { wsId } = router.query;

  const { data: ws, error: wsError } = useSWR(
    wsId ? `/api/workspaces/${wsId}` : null
  );

  const { data: projectsData, error: projectsError } = useSWR(
    wsId ? `/api/workspaces/${wsId}/projects` : null
  );

  const isWsLoading = !ws && !wsError;
  const isProjectsLoading = !projectsData && !projectsError;

  const isLoading = isWsLoading || isProjectsLoading;

  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment(
      wsId
        ? [
            {
              content: ws?.name ?? 'Loading...',
              href: `/${wsId}`,
            },
            {
              content: 'Projects',
              href: `/${wsId}/projects`,
            },
          ]
        : []
    );
  }, [setRootSegment, wsId, ws?.name]);

  if (isLoading) return <div>Loading...</div>;

  const createProject = async (wsId: string, project: Partial<Project>) => {
    const res = await fetch(`/api/workspaces/${wsId}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(project),
    });

    if (res.status === 200) {
      mutate(`/api/workspaces/${wsId}/projects`);
      showNotification({
        title: 'Project created',
        color: 'teal',
        message: `Project ${project.name} created successfully`,
      });

      const data = await res.json();
      router.push(`/projects/${data.id}`);
    } else {
      showNotification({
        title: 'Error',
        color: 'red',
        message: `Project ${project.name} could not be created`,
      });
    }
  };

  const showProjectEditForm = () => {
    openModal({
      title: <div className="font-semibold">Create new project</div>,
      centered: true,
      children: (
        <ProjectEditForm
          onSubmit={(project) => createProject(wsId as string, project)}
        />
      ),
    });
  };

  return (
    <>
      <HeaderX label={`Projects – ${ws?.name || 'Unnamed Workspace'}`} />

      {wsId && (
        <>
          <div className="rounded-lg bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">
              Projects{' '}
              <span className="rounded-lg bg-purple-300/20 px-2 text-lg text-purple-300">
                {projectsData?.length || 0}
              </span>
            </h1>
            <p className="text-zinc-400">
              Organize work into projects and track progress with ease.
            </p>
          </div>
        </>
      )}

      <Divider className="my-4" />

      {wsId && (
        <button
          onClick={showProjectEditForm}
          className="flex items-center gap-1 rounded bg-blue-300/20 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-300/10"
        >
          New project <SquaresPlusIcon className="h-4 w-4" />
        </button>
      )}

      <div className="mt-4 grid gap-4">
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {projectsData?.map(
            (project: { id: string; name: string; created_at: string }) => (
              <Link
                key={project.id}
                href={`/${ws.id}/projects/${project.id}`}
                className="group rounded-lg border border-zinc-800/80 bg-[#19191d] p-4 transition hover:bg-[#232327]"
              >
                <h1 className="font-bold">
                  {project?.name || 'Untitled Project'}
                </h1>

                {project?.created_at ? (
                  <>
                    <Divider className="mb-2 mt-8" variant="dashed" />
                    <div className="w-fit rounded-lg border border-blue-300/20 bg-blue-300/10 px-4 py-2 text-blue-300/50 transition group-hover:border-transparent">
                      Started{' '}
                      <span className="font-semibold text-blue-300">
                        {moment(project.created_at).fromNow()}
                      </span>
                    </div>
                  </>
                ) : null}
              </Link>
            )
          )}
        </div>
      </div>
    </>
  );
};

WorkspaceProjectsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="workspace">{page}</NestedLayout>;
};

export default WorkspaceProjectsPage;
