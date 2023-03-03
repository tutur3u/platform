import { Divider, TextInput } from '@mantine/core';
import moment from 'moment';
import { useRouter } from 'next/router';
import { ReactElement, useEffect, useState } from 'react';
import useSWR, { mutate } from 'swr';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';
import HeaderX from '../../../components/metadata/HeaderX';
import { Project } from '../../../types/primitives/Project';
import { openModal } from '@mantine/modals';
import ProjectDeleteForm from '../../../components/forms/ProjectDeleteForm';

const ProjectSettingsPage = () => {
  const router = useRouter();
  const { projectId } = router.query;

  const { data: project, error } = useSWR(
    projectId ? `/api/projects/${projectId}` : null
  );

  const isLoading = !error && !project;

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      project?.workspaces?.id
        ? [
            {
              content: project?.workspaces?.name || 'Unnamed Workspace',
              href: `/workspaces/${project?.workspaces?.id}`,
            },
            {
              content: 'Projects',
              href: `/workspaces/${project?.workspaces?.id}/projects`,
            },
            {
              content: project?.name || 'Untitled Project',
              href: `/projects/${projectId}`,
            },
            { content: 'Settings', href: `/projects/${projectId}/settings` },
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

  const showDeleteProjectModal = async (project: Project) => {
    openModal({
      title: <div className="font-semibold">Are you absolutely sure?</div>,
      centered: true,
      children: <ProjectDeleteForm project={project} onDelete={handleDelete} />,
    });
  };

  const [name, setName] = useState<string>(project?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (isLoading) return <div>Loading...</div>;

  const handleSave = async () => {
    setIsSaving(true);

    if (!project) {
      setIsSaving(false);
      throw new Error('Failed to save project');
    }

    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
      }),
    });

    if (res.ok) {
      setRootSegment(
        project?.workspaces?.id
          ? [
              {
                content: project?.workspaces?.name || 'Unnamed Workspace',
                href: `/workspaces/${project.workspaces.id}`,
              },
              {
                content: 'Projects',
                href: `/workspaces/${project.workspaces.id}/projects`,
              },
              {
                content: name || 'Untitled Project',
                href: `/projects/${projectId}`,
              },
              { content: 'Settings', href: `/projects/${projectId}/settings` },
            ]
          : []
      );

      mutate(`/api/projects/${projectId}`);
      mutate(`/api/workspaces/${project.workspaces.id}/projects`);
    }

    setIsSaving(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);

    if (!project) {
      setIsDeleting(false);
      throw new Error('Failed to delete project');
    }

    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      router.push(`/workspaces/${project.workspaces.id}/projects`);
      mutate(`/api/workspaces/${project.workspaces.id}/projects`);
    }
  };

  return (
    <>
      <HeaderX label={`Settings – ${project?.name || 'Untitled Project'}`} />

      {projectId && (
        <>
          <div className="rounded-lg bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-zinc-400">
              Manage the settings of your project.
            </p>
          </div>
        </>
      )}

      <Divider className="my-4" />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
          <div className="mb-1 text-3xl font-bold">Basic Information</div>
          <div className="mb-4 font-semibold text-zinc-500">
            Manage the basic information of your project.
          </div>

          <div className="grid max-w-xs gap-2">
            <TextInput
              label="Name"
              placeholder={project?.name || name || 'Untitled Project'}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </div>

          <div className="mt-8 border-t border-zinc-700/70 pt-4 text-zinc-500">
            This project was created{' '}
            <span className="font-semibold text-zinc-300">
              {moment(project.created_at).fromNow()}
            </span>
            .
          </div>

          <div className="h-full" />

          <button
            onClick={
              isSaving || name === project?.name ? undefined : handleSave
            }
            className={`${
              isSaving || name === project?.name
                ? 'cursor-not-allowed opacity-50'
                : 'hover:border-blue-300/30 hover:bg-blue-300/20'
            } col-span-full mt-8 flex w-full items-center justify-center rounded-lg border border-blue-300/20 bg-blue-300/10 p-2 text-xl font-semibold text-blue-300 transition`}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>

        <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
          <div className="mb-1 text-3xl font-bold">Security</div>
          <div className="mb-4 font-semibold text-zinc-500">
            Manage the security of your project.
          </div>

          <div className="grid h-full items-end gap-4 text-center xl:grid-cols-2">
            <div
              className="col-span-full flex h-fit w-full cursor-pointer items-center justify-center rounded-lg border border-red-300/20 bg-red-300/10 p-2 text-xl font-semibold text-red-300 transition duration-300 hover:border-red-300/30 hover:bg-red-300/20"
              onClick={() => showDeleteProjectModal(project)}
            >
              {isDeleting ? 'Deleting...' : 'Delete Project'}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

ProjectSettingsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="project">{page}</NestedLayout>;
};

export default ProjectSettingsPage;
