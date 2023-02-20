import { useRouter } from 'next/router';
import useSWR from 'swr';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { ReactElement, useEffect, useState } from 'react';
import { useAppearance } from '../../../../hooks/useAppearance';
import {
  Divider,
  Loader,
  SegmentedControl,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  Cog6ToothIcon,
  DocumentCheckIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import { useDebouncedValue } from '@mantine/hooks';
import DocumentEditor from '../../../../components/editor/DocumentEditor';
import { Document } from '../../../../types/primitives/Document';
import Highlight from '@tiptap/extension-highlight';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Superscript from '@tiptap/extension-superscript';
import SubScript from '@tiptap/extension-subscript';
import { useEditor } from '@tiptap/react';
import { Link } from '@mantine/tiptap';
import { openConfirmModal } from '@mantine/modals';
import HeaderX from '../../../../components/metadata/HeaderX';

const ProjectDocumentEditor = () => {
  const router = useRouter();
  const { projectId, docId } = router.query;

  const { data: project, error: projectError } = useSWR(
    projectId ? `/api/projects/${projectId}` : null
  );

  const projectLoading = !project && !projectError;

  const { data: document, error: documentError } = useSWR<Document>(
    docId ? `/api/projects/${projectId}/documents/${docId}` : null
  );

  const documentLoading = !document && !documentError;

  const { setRootSegment, setLastSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      project?.orgs?.id
        ? [
            {
              content: project?.orgs?.name || 'Unnamed Workspace',
              href: `/orgs/${project.orgs.id}`,
            },
            {
              content: 'Projects',
              href: `/orgs/${project?.orgs?.id}/projects`,
            },
            {
              content: project?.name || 'Untitled Project',
              href: `/projects/${projectId}`,
            },
            { content: 'Documents', href: `/projects/${projectId}/documents` },
            {
              content: document
                ? document?.name || 'Untitled Document'
                : 'Loading...',
              href: `/projects/${projectId}/documents/${docId}`,
            },
          ]
        : []
    );
  }, [projectId, docId, project, document, setRootSegment]);

  const [name, setName] = useState<string | null>();
  const [content, setContent] = useState<string | null>();

  useEffect(() => {
    setLastSegment({
      content: document ? name || 'Untitled Document' : 'Loading...',
      href: `/projects/${projectId}/documents/${docId}`,
    });
  }, [projectId, docId, document, name, setLastSegment]);

  const [mode, setMode] = useState('preview');

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link,
      Superscript,
      SubScript,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: content,
    onUpdate: ({ editor }) => {
      setSaving(true);
      setContent(editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const editable = mode === 'edit';
    editor.setEditable(editable);
    setSaving(false);
  }, [mode, editor]);

  useEffect(() => {
    if (!document) return;
    setName(document?.name || '');
    setContent(document?.content || '');

    if (!editor) return;
    if (!editor?.commands) return;
    if (!document?.content) return;

    editor.commands.setContent(document.content);
  }, [document, editor]);

  const [saving, setSaving] = useState(false);

  const [debouncedName] = useDebouncedValue(name, 1000);
  const [debouncedContent] = useDebouncedValue(content, 1000);

  useEffect(() => {
    if (!document) return;
    if (!projectId || !docId) return;
    if (name == null && content == null) return;

    if (name !== debouncedName || content !== debouncedContent) return;
    if (name === document?.name && content === document?.content) {
      setSaving(false);
      return;
    }

    fetch(`/api/projects/${projectId}/documents/${docId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: debouncedName,
        content: debouncedContent,
      }),
    })
      .then((res) => res.json())
      .then((_) => {
        setSaving(false);
      });
  }, [
    name,
    content,
    debouncedName,
    debouncedContent,
    document,
    projectId,
    docId,
  ]);

  const deleteDocument = async () => {
    if (!projectId || !docId) return;

    openConfirmModal({
      title: <div className="font-semibold">Delete Document</div>,
      children: 'Are you sure you want to delete this document?',
      labels: {
        confirm: 'Delete',
        cancel: 'Cancel',
      },
      centered: true,
      onConfirm: () => {
        fetch(`/api/projects/${projectId}/documents/${docId}`, {
          method: 'DELETE',
        })
          .then((res) => res.json())
          .then((_) => {
            router.push(`/projects/${projectId}/documents`);
          });
      },
    });
  };

  return (
    <>
      <HeaderX
        label={`${name || 'Untitled Document'} - ${
          project?.name || 'Untitled Project'
        }`}
      />

      {document && (
        <>
          <div className="flex items-center justify-between gap-4">
            <div className="flex w-full items-center gap-4">
              {saving ? (
                <Loader className="h-7 w-7" />
              ) : (
                <Tooltip label="Saved">
                  <DocumentCheckIcon className="h-7 w-7 text-green-500" />
                </Tooltip>
              )}

              <TextInput
                placeholder="Untitled Document"
                defaultValue={name || ''}
                onChange={(e) => {
                  setSaving(true);
                  setName(e.currentTarget.value);
                }}
                variant="unstyled"
                className="w-full"
                classNames={{
                  input: 'text-2xl font-semibold',
                }}
                autoComplete="off"
              />
            </div>

            <button
              onClick={deleteDocument}
              className="h-fit rounded-lg bg-zinc-300/10 p-2 text-zinc-300 hover:bg-zinc-300/20 hover:text-zinc-100"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>

          <Divider variant="dashed" className="my-2" />

          <SegmentedControl
            value={mode}
            onChange={setMode}
            data={[
              {
                label: (
                  <div className="flex items-center gap-2">
                    <EyeIcon className="inline-block h-5" /> Preview
                  </div>
                ),
                value: 'preview',
              },
              {
                label: (
                  <div className="flex items-center gap-2">
                    <PencilIcon className="inline-block h-5" /> Edit
                  </div>
                ),
                value: 'edit',
              },
            ]}
            className="mb-2"
          />
        </>
      )}

      {document && editor ? (
        <DocumentEditor editor={editor} />
      ) : (
        <div className="flex items-center justify-center">
          <Loader />
        </div>
      )}
    </>
  );
};

ProjectDocumentEditor.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="document">{page}</NestedLayout>;
};

export default ProjectDocumentEditor;
