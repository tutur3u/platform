import { CheckBadgeIcon } from '@heroicons/react/20/solid';
import { Tooltip } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import Link from 'next/link';
import useSWR, { mutate } from 'swr';
import { Workspace } from '../../types/primitives/Workspace';
import { Project } from '../../types/primitives/Project';
import ProjectEditForm from '../forms/ProjectEditForm';

interface Props {
  ws: Workspace;
}

const WorkspacePreviewCard = ({ ws }: Props) => {
  const { data: projects, error } = useSWR(
    ws?.id ? `/api/workspaces/${ws?.id}/projects` : null
  );

  const isLoading = !projects && !error;

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
    } else {
      showNotification({
        title: 'Error',
        color: 'red',
        message: `Project ${project.name} could not be created`,
      });
    }
  };

  const showProjectEditForm = () => {
    if (!ws.id) return;
    openModal({
      title: <div className="font-semibold">Create new project</div>,
      centered: true,
      children: (
        <ProjectEditForm
          onSubmit={(project) => createProject(ws.id, project)}
        />
      ),
    });
  };

  const isRoot = ws?.id === '00000000-0000-0000-0000-000000000000';

  return (
    <div>
      <Link
        href={`/workspaces/${ws.id}`}
        className={`${
          isRoot
            ? 'text-purple-200 hover:text-purple-300'
            : 'text-zinc-300 hover:text-blue-200'
        } text-2xl font-semibold transition duration-150`}
      >
        {ws?.name || `Unnamed Workspace`}
        {isRoot && (
          <Tooltip label="Verified workspace" withArrow>
            <CheckBadgeIcon className="ml-1 inline-block h-6 w-6 text-purple-300" />
          </Tooltip>
        )}
      </Link>
      <div className="mt-2 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <div
          className="flex h-32 cursor-pointer items-center justify-center rounded bg-zinc-500/10 p-2 text-xl font-semibold text-zinc-300 transition duration-300 hover:bg-blue-300/10 hover:text-blue-300"
          onClick={showProjectEditForm}
        >
          New project
        </div>
        {isLoading ||
          projects?.slice(0, 3)?.map((project: Project) => (
            <Link
              key={project.id}
              className="flex h-32 cursor-pointer items-center justify-center rounded bg-zinc-800/80 p-4 text-center text-xl font-semibold text-zinc-300 transition duration-150 hover:bg-zinc-800"
              href={`/projects/${project.id}`}
            >
              {project?.name || `Untitled Project`}
            </Link>
          ))}
        {projects?.length > 3 && (
          <Link
            className="col-span-full flex cursor-pointer items-center justify-center rounded bg-zinc-500/10 p-4 text-center text-xl font-semibold text-zinc-300 transition duration-150 hover:bg-zinc-800"
            href={`/workspaces/${ws.id}/projects`}
          >
            View all projects
          </Link>
        )}
      </div>
    </div>
  );
};

export default WorkspacePreviewCard;
