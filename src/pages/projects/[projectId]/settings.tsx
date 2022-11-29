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
              content: project?.name || 'Untitled',
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
          content: name || 'Untitled',
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
    <div className="grid lg:grid-cols-2 gap-4">
      <h1 className="col-span-full font-bold">Settings</h1>

      <div className="p-4 flex flex-col border border-zinc-800/80 bg-[#19191d] rounded-lg">
        <div className="text-3xl font-bold mb-1">Basic Information</div>
        <div className="font-semibold text-zinc-500 mb-4">
          Manage the basic information of your project.
        </div>

        <div className="grid gap-2 max-w-xs">
          <TextInput
            label="Name"
            placeholder={project?.name ?? name ?? 'Untitled'}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </div>

        <div className="border-t pt-4 mt-8 border-zinc-700/70 text-zinc-500">
          This project was created{' '}
          <span className="text-zinc-300 font-semibold">
            {moment(project.created_at).fromNow()}
          </span>
          .
        </div>

        <div className="h-full" />

        <div
          onClick={handleSave}
          className="mt-8 col-span-full w-full p-2 flex items-center border border-blue-300/20 hover:border-blue-300/30 justify-center font-semibold text-xl bg-blue-300/10 hover:bg-blue-300/20 text-blue-300 rounded-lg cursor-pointer transition duration-300"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </div>
      </div>

      <div className="flex flex-col p-4 border border-zinc-800/80 bg-[#19191d] rounded-lg">
        <div className="text-3xl font-bold mb-1">Security</div>
        <div className="font-semibold text-zinc-500 mb-4">
          Manage the security of your project.
        </div>

        <div className="h-full text-center grid xl:grid-cols-2 items-end gap-4">
          <div
            className="col-span-full w-full h-fit p-2 flex items-center border border-red-300/20 hover:border-red-300/30 justify-center font-semibold text-xl bg-red-300/10 hover:bg-red-300/20 text-red-300 rounded-lg cursor-pointer transition duration-300"
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
