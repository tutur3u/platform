import { useRouter } from 'next/router';
import React, { ReactElement, useEffect, useState } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { useAppearance } from '../../../../hooks/useAppearance';
import HeaderX from '../../../../components/metadata/HeaderX';
import { Divider, Loader } from '@mantine/core';
import {
  DocumentPlusIcon,
  ListBulletIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/solid';
import { Document } from '../../../../types/primitives/Document';
import { showNotification } from '@mantine/notifications';
import DocumentCard from '../../../../components/document/DocumentCard';
import DocumentEditForm from '../../../../components/forms/DocumentEditForm';
import { openModal } from '@mantine/modals';

const ProjectDocumentsPage = () => {
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
            { content: 'Documents', href: `/projects/${projectId}/documents` },
          ]
        : []
    );
  }, [
    projectId,
    project?.workspaces?.id,
    project?.workspaces?.name,
    project?.name,
    setRootSegment,
  ]);

  const { data: documents } = useSWR<Document[]>(
    projectId ? `/api/projects/${projectId}/documents` : null
  );

  const [creating, setCreating] = useState(false);

  const createDocument = async ({
    projectId,
    doc,
  }: {
    projectId: string;
    doc: Partial<Document>;
  }) => {
    setCreating(true);

    const res = await fetch(`/api/projects/${projectId}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: doc.name,
      }),
    });

    if (!res.ok) {
      setCreating(false);
      showNotification({
        title: 'Error',
        message: 'An error occurred while creating the document.',
        color: 'red',
      });
      return;
    }

    const { id } = await res.json();
    router.push(`/projects/${projectId}/documents/${id}`);
  };

  const showDocumentEditForm = () => {
    openModal({
      title: <div className="font-semibold">Create new document</div>,
      centered: true,
      children: (
        <DocumentEditForm
          wsId={project.workspaces.id}
          onSubmit={(projectId, doc) => createDocument({ projectId, doc })}
        />
      ),
    });
  };

  const [mode, setMode] = useState<'list' | 'grid'>('grid');

  return (
    <>
      <HeaderX label={`Documents – ${project?.name || 'Untitled Project'}`} />

      {projectId && (
        <div className="flex flex-col items-center gap-4 md:flex-row">
          <h1 className="w-full flex-grow rounded-lg bg-zinc-900 p-4 text-2xl font-bold md:w-auto">
            Documents{' '}
            <span className="rounded-lg bg-purple-300/20 px-2 text-lg text-purple-300">
              {documents?.length || 0}
            </span>
          </h1>

          <div className="flex gap-4">
            <button
              onClick={showDocumentEditForm}
              className="flex flex-none items-center gap-1 rounded bg-blue-300/20 p-4 font-semibold text-blue-300 transition hover:bg-blue-300/10"
            >
              {creating ? 'Creating document' : 'New document'}{' '}
              {creating ? (
                <Loader className="ml-1 h-4 w-4" />
              ) : (
                <DocumentPlusIcon className="h-4 w-4" />
              )}
            </button>
            <div className="flex gap-2 rounded-lg border border-zinc-800 p-2">
              <button
                className={`${
                  mode === 'list' ? 'bg-zinc-800' : 'text-zinc-700'
                } h-fit rounded-lg p-2 transition`}
                onClick={() => setMode('list')}
              >
                <ListBulletIcon className="h-6 w-6" />
              </button>
              <button
                className={`${
                  mode === 'grid' ? 'bg-zinc-800' : 'text-zinc-700'
                } h-fit rounded-lg p-2 transition`}
                onClick={() => setMode('grid')}
              >
                <Squares2X2Icon className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      )}

      <Divider className="my-4" />

      <button
        onClick={showDocumentEditForm}
        className="flex items-center gap-1 rounded bg-blue-300/20 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-300/10"
      >
        {creating ? 'Creating document' : 'New document'}{' '}
        {creating ? (
          <Loader className="ml-1 h-4 w-4" />
        ) : (
          <DocumentPlusIcon className="h-4 w-4" />
        )}
      </button>

      <div
        className={`grid ${
          mode === 'list'
            ? 'grid-cols-1'
            : 'md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
        } mb-8 mt-4 gap-4`}
      >
        {documents &&
          documents?.map((doc) => (
            <DocumentCard
              key={`doc-${doc.id}`}
              projectId={projectId as string}
              document={doc}
              mode={mode}
            />
          ))}
      </div>
    </>
  );
};

ProjectDocumentsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="project">{page}</NestedLayout>;
};

export default ProjectDocumentsPage;
