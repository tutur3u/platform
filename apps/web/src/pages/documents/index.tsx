import { ReactElement, useEffect } from 'react';
import HeaderX from '../../components/metadata/HeaderX';
import { useAppearance } from '../../hooks/useAppearance';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import DocumentCard from '../../components/document/DocumentCard';
import { useUser } from '@supabase/auth-helpers-react';
import useSWR from 'swr';
import { Document } from '../../types/primitives/Document';
import { useProjects } from '../../hooks/useProjects';
import NestedLayout from '../../components/layouts/NestedLayout';
import { Divider } from '@mantine/core';
import PlusCardButton from '../../components/common/PlusCardButton';
import { openModal } from '@mantine/modals';
import DocumentEditForm from '../../components/forms/DocumentEditForm';
import { showNotification } from '@mantine/notifications';
import { useRouter } from 'next/router';

const DocumentsPage: PageWithLayoutProps = () => {
  const router = useRouter();
  const user = useUser();

  const { wsId } = useProjects();
  const { setRootSegment, changeLeftSidebarSecondaryPref } = useAppearance();

  const { data: workspace, error: workspaceError } = useSWR(
    wsId ? `/api/workspaces/${wsId}` : null
  );

  useEffect(() => {
    setRootSegment(
      wsId
        ? [
            {
              content: workspace?.name || 'Unnamed Workspace',
              href: `/workspaces/${wsId}`,
            },
            { content: 'Documents', href: `/documents` },
          ]
        : []
    );
  }, [wsId, workspace?.name, setRootSegment]);

  const { data: documents, error: documentsError } = useSWR<Document[]>(
    user?.id && wsId ? `/api/users/${user.id}/documents?wsId=${wsId}` : null
  );

  const createDocument = async ({
    projectId,
    doc,
  }: {
    projectId: string;
    doc: Partial<Document>;
  }) => {
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
          wsId={wsId}
          onSubmit={(projectId, doc) => createDocument({ projectId, doc })}
        />
      ),
    });
  };

  return (
    <>
      <HeaderX label="Documents" />

      <div className="rounded-lg bg-zinc-900 p-4">
        <h1 className="text-2xl font-bold">
          Documents{' '}
          <span className="rounded-lg bg-purple-300/20 px-2 text-lg text-purple-300">
            {documents?.length || 0}
          </span>
        </h1>
      </div>

      <Divider className="my-4" />

      <div className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {documents && documents.length === 0 && (
          <div className="col-span-full text-zinc-500">
            No documents on this workspace.
          </div>
        )}

        <PlusCardButton onClick={showDocumentEditForm} />
        {documents &&
          documents?.map((doc) => (
            <DocumentCard document={doc} hideProject={false} />
          ))}
      </div>
    </>
  );
};

DocumentsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="document">{page}</NestedLayout>;
};

export default DocumentsPage;
