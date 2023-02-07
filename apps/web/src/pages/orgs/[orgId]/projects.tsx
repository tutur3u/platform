import { PlusIcon } from '@heroicons/react/24/solid';
import { openModal } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';
import { Project } from '../../../types/primitives/Project';
import moment from 'moment';
import ProjectEditForm from '../../../components/forms/ProjectEditForm';
import HeaderX from '../../../components/metadata/HeaderX';
import { Divider } from '@mantine/core';

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
      orgId
        ? [
            {
              content: orgData?.name ?? 'Loading...',
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

  const createProject = async (orgId: string, project: Partial<Project>) => {
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
    if (!orgId) return;
    openModal({
      title: <div className="font-semibold">Create new project</div>,
      centered: true,
      children: (
        <ProjectEditForm
          onSubmit={(project) => createProject(orgId as string, project)}
        />
      ),
    });
  };

  return (
    <>
      <HeaderX
        label={`Projects – ${orgData?.name || 'Unnamed Organization'}`}
        disableBranding
      />

      <div className="grid gap-4">
        {orgId && (
          <div className="mt-2 mb-2 flex items-center justify-between">
            <h1 className="text-lg font-bold md:text-xl lg:text-2xl xl:text-3xl">
              Projects ({projectsData?.length || 0})
            </h1>
            <button
              onClick={showProjectEditForm}
              className="flex items-center gap-1 rounded bg-blue-300/20 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-300/10"
            >
              New project <PlusIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {projectsData?.map(
            (project: { id: string; name: string; created_at: string }) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group rounded-lg border border-zinc-800/80 bg-[#19191d] p-4 transition hover:bg-[#232327]"
              >
                <h1 className="font-bold">{project.name}</h1>

                {project?.created_at ? (
                  <>
                    <Divider className="mt-8 mb-2" variant="dashed" />
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

OrganizationProjectsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default OrganizationProjectsPage;
