import { PlusIcon } from '@heroicons/react/24/solid';
import { openModal } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import ProjectEditForm from '../../../components/forms/ProjectEditForm';
import NestedLayout from '../../../components/layout/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';
import { Project } from '../../../types/primitives/Project';
import moment from 'moment';

const OrganizationProjectsPage = () => {
  const router = useRouter();
  const { orgId } = router.query;

  const { data: orgData, error: orgError } = useSWR(
    orgId ? `/api/orgs/${orgId}` : null
  );

  const { data: projectsData, error: projectsError } = useSWR(
    orgId ? `/api/orgs/${orgId}/projects` : null
  );

  const isLoadingOrg = !orgData && !orgError;
  const isLoadingprojects = !projectsData && !projectsError;

  const isLoading = isLoadingOrg || isLoadingprojects;

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      orgData?.name
        ? [
            {
              content: orgData.name,
              href: `/orgs/${orgId}`,
            },
            {
              content: 'Projects',
              href: `/orgs/${orgId}/projects`,
            },
          ]
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, orgData?.name]);

  if (isLoading) return <div>Loading...</div>;

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
    if (!orgId) return;
    openModal({
      title: <div className="font-semibold">Create new project</div>,
      centered: true,
      children: (
        <ProjectEditForm orgId={orgId as string} onSubmit={createProject} />
      ),
    });
  };

  return (
    <div className="grid gap-4">
      {orgId && (
        <div className="flex justify-between items-center mt-2 mb-2">
          <h1 className="font-bold text-lg md:text-xl lg:text-2xl xl:text-3xl">
            Projects ({projectsData?.length || 0})
          </h1>
          <button
            onClick={showProjectEditForm}
            className="px-4 py-2 font-semibold rounded flex gap-1 bg-blue-300/20 text-blue-300 hover:bg-blue-300/10 transition"
          >
            New project <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {projectsData?.map(
          (project: { id: string; name: string; created_at: string }) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="relative p-4 group border border-zinc-800/80 bg-[#19191d] hover:bg-[#232327] rounded-lg h-72 transition"
            >
              <h1 className="font-bold">{project.name}</h1>

              {project?.created_at ? (
                <div className="px-4 py-2 bg-blue-300/10 group-hover:border-transparent border border-blue-300/20 rounded-lg absolute bottom-4 right-4 text-blue-300/50 transition">
                  Started{' '}
                  <span className="text-blue-300 font-semibold">
                    {moment(project.created_at).fromNow()}
                  </span>
                </div>
              ) : null}
            </Link>
          )
        )}
      </div>
    </div>
  );
};

OrganizationProjectsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default OrganizationProjectsPage;
