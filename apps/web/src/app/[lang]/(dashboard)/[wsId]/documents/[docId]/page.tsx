'use client';

import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useEffect, useState } from 'react';
import { useSegments } from '../../../../../../hooks/useSegments';
import {
  Divider,
  Loader,
  SegmentedControl,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  DocumentCheckIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import { useDebouncedValue } from '@mantine/hooks';
import DocumentEditor from '../../../../../../components/editor/DocumentEditor';
import { Document } from '../../../../../../types/primitives/Document';
import Highlight from '@tiptap/extension-highlight';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Superscript from '@tiptap/extension-superscript';
import SubScript from '@tiptap/extension-subscript';
import { useEditor } from '@tiptap/react';
import { Link } from '@mantine/tiptap';
import { openConfirmModal } from '@mantine/modals';
import { useWorkspaces } from '../../../../../../hooks/useWorkspaces';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  params: {
    wsId?: string;
    docId?: string;
  };
}

export default function ProjectDocumentEditor({
  params: { wsId, docId },
}: Props) {
  const router = useRouter();
  const { ws } = useWorkspaces();

  const { data: doc } = useSWR<Document>(
    wsId && docId ? `/api/workspaces/${wsId}/documents/${docId}` : null
  );

  const { setRootSegment } = useSegments();

  const { t } = useTranslation('documents');

  const documentsLabel = t('documents');
  const untitledDocumentLabel = t('untitled-document');
  const loadingLabel = t('loading');

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws.name || 'Unnamed Workspace',
              href: `/${ws.id}`,
            },
            { content: documentsLabel, href: `/${ws.id}/documents` },
            {
              content: doc ? doc?.name || untitledDocumentLabel : loadingLabel,
              href: `/${ws.id}/documents/${docId}`,
            },
          ]
        : []
    );
  }, [
    ws,
    docId,
    doc,
    documentsLabel,
    untitledDocumentLabel,
    loadingLabel,
    setRootSegment,
  ]);

  const [name, setName] = useState<string | null>();
  const [content, setContent] = useState<string | null>();

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
    const editable = mode === 'edit' && doc?.id !== null;
    editor.setEditable(editable);
    setSaving(false);
  }, [mode, editor, doc?.id]);

  useEffect(() => {
    if (!doc) return;
    setName(doc?.name || '');
    setContent(doc?.content || '');

    if (!editor) return;
    if (!editor?.commands) return;
    if (!doc?.content) return;

    editor.commands.setContent(doc.content);
  }, [doc, editor]);

  const [saving, setSaving] = useState(false);

  const [debouncedName] = useDebouncedValue(name, 1000);
  const [debouncedContent] = useDebouncedValue(content, 1000);

  useEffect(() => {
    if (!doc || !ws) return;
    if (!docId) return;
    if (name == null && content == null) return;

    if (name !== debouncedName || content !== debouncedContent) return;
    if (name === doc?.name && content === doc?.content) {
      setSaving(false);
      return;
    }

    fetch(`/api/workspaces/${ws.id}/documents/${docId}`, {
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
      .then(() => setSaving(false));
  }, [
    doc,
    ws,
    docId,
    name,
    content,
    debouncedName,
    debouncedContent,
    setSaving,
  ]);

  const deleteDocument = async () => {
    if (!docId || !ws) return;

    openConfirmModal({
      title: <div className="font-semibold">{t('delete-document')}</div>,
      children: t('delete-document-confirmation'),
      labels: {
        confirm: (
          <div className="text-blue-200 dark:text-blue-300">{t('delete')}</div>
        ),
        cancel: t('cancel'),
      },
      centered: true,
      onConfirm: () => {
        fetch(`/api/workspaces/${ws.id}/documents/${docId}`, {
          method: 'DELETE',
        })
          .then((res) => res.json())
          .then(() => router.push(`/${ws.id}/documents`));
      },
    });
  };

  return (
    <>
      {doc && (
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
                placeholder={untitledDocumentLabel}
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
              className="h-fit rounded-lg bg-zinc-500/5 p-2 text-zinc-600 hover:bg-zinc-500/10 dark:bg-zinc-300/10 dark:text-zinc-300 dark:hover:bg-zinc-300/20 dark:hover:text-zinc-100"
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
                    <EyeIcon className="inline-block h-5" /> {t('preview')}
                  </div>
                ),
                value: 'preview',
              },
              {
                label: (
                  <div className="flex items-center gap-2">
                    <PencilIcon className="inline-block h-5" /> {t('edit')}
                  </div>
                ),
                value: 'edit',
                disabled: !doc?.id,
              },
            ]}
            className="mb-2"
          />
        </>
      )}

      {doc?.id && editor ? (
        <DocumentEditor editor={editor} />
      ) : (
        <div className="flex items-center justify-center">
          <Loader />
        </div>
      )}
    </>
  );
}
