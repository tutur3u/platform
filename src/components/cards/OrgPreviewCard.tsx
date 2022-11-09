import { SparklesIcon } from '@heroicons/react/24/solid';
import { openModal } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import Link from 'next/link';
import useSWR, { mutate } from 'swr';
import { Organization } from '../../types/primitives/Organization';
import { Project } from '../../types/primitives/Project';
import ProjectEditForm from '../forms/ProjectEditForm';

interface Props {
  org: Organization;
}

const OrgPreviewCard = ({ org }: Props) => {
  const { data: projects, error } = useSWR(
    org?.id ? `/api/orgs/${org?.id}/projects` : null
  );

  const isLoading = !projects && !error;

  const createProject = async (orgId: string, project: Project) => {
    const res = await fetch(`/api/orgs/${orgId}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(project),
    });

    if (res.status === 200) {
      mutate(`/api/orgs/${orgId}/projects`);
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
    if (!org.id) return;
    openModal({
      title: <div className="font-semibold">Create new project</div>,
      centered: true,
      children: <ProjectEditForm orgId={org.id} onSubmit={createProject} />,
    });
  };

  return (
    <div>
      <Link
        href={`/orgs/${org.id}`}
        className="text-zinc-300 hover:text-blue-200 text-2xl font-semibold transition duration-150"
      >
        {org?.name || `Unnamed organization`}{' '}
        {org?.id === '00000000-0000-0000-0000-000000000000' && (
          <SparklesIcon className="inline-block w-5 h-5 text-yellow-300" />
        )}
      </Link>
      <div className="mt-2 grid md:grid-cols-2 2xl:grid-cols-4 gap-4">
        <div
          className="p-2 h-32 flex justify-center items-center font-semibold text-xl rounded bg-zinc-500/10 hover:bg-blue-300/10 text-zinc-300 hover:text-blue-300 cursor-pointer transition duration-300"
          onClick={showProjectEditForm}
        >
          New project
        </div>
        {isLoading ||
          projects?.slice(0, 3)?.map((project: Project) => (
            <Link
              key={project.id}
              className="p-4 h-32 flex justify-center items-center text-center bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 font-semibold text-xl rounded transition duration-150 cursor-pointer"
              href={`/projects/${project.id}`}
            >
              {project?.name || `Unnamed project`}
            </Link>
          ))}
        {projects?.length > 3 && (
          <Link
            className="p-4 col-span-full flex justify-center items-center text-center bg-zinc-500/10 hover:bg-zinc-800 text-zinc-300 font-semibold text-xl rounded transition duration-150 cursor-pointer"
            href={`/orgs/${org.id}/projects`}
          >
            View all projects
          </Link>
        )}
      </div>
    </div>
  );
};

export default OrgPreviewCard;
