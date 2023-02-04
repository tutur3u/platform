import { TextInput } from '@mantine/core';
import moment from 'moment';
import { useRouter } from 'next/router';
import { ReactElement, useEffect, useState } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../components/layout/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';

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
      project?.orgs?.id
        ? [
            {
              content: project?.orgs?.name || 'Unnamed Organization',
              href: `/orgs/${project?.orgs?.id}`,
            },
            {
              content: 'Projects',
              href: `/orgs/${project?.orgs?.id}/projects`,
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
  }, [projectId, project]);

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

    if (res.status === 200) {
      setRootSegment([
        {
          content: project?.orgs?.name || 'Unnamed Organization',
          href: `/orgs/${project.orgs.id}`,
        },
        {
          content: 'Projects',
          href: `/orgs/${project.orgs.id}/projects`,
        },
        {
          content: name || 'Untitled Project',
          href: `/projects/${projectId}`,
        },
        { content: 'Settings', href: `/projects/${projectId}/settings` },
      ]);
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

    if (res.status === 200) {
      router.push(`/orgs/${project.orgs.id}/projects`);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <h1 className="col-span-full font-bold">Settings</h1>

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

        <div
          onClick={handleSave}
          className="col-span-full mt-8 flex w-full cursor-pointer items-center justify-center rounded-lg border border-blue-300/20 bg-blue-300/10 p-2 text-xl font-semibold text-blue-300 transition duration-300 hover:border-blue-300/30 hover:bg-blue-300/20"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </div>
      </div>

      <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
        <div className="mb-1 text-3xl font-bold">Security</div>
        <div className="mb-4 font-semibold text-zinc-500">
          Manage the security of your project.
        </div>

        <div className="grid h-full items-end gap-4 text-center xl:grid-cols-2">
          <div
            className="col-span-full flex h-fit w-full cursor-pointer items-center justify-center rounded-lg border border-red-300/20 bg-red-300/10 p-2 text-xl font-semibold text-red-300 transition duration-300 hover:border-red-300/30 hover:bg-red-300/20"
            onClick={handleDelete}
          >
            {isDeleting ? 'Deleting...' : 'Delete Project'}
          </div>
        </div>
      </div>
    </div>
  );
};

ProjectSettingsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout orgMode={false}>{page}</NestedLayout>;
};

export default ProjectSettingsPage;
