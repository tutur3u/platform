import { Button, Select, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import React, { useEffect, useState } from 'react';
import { ChangeEvent } from 'react';
import { Document } from '../../types/primitives/Document';
import useSWR from 'swr';
import { showNotification } from '@mantine/notifications';

interface DocumentEditFormProps {
  wsId: string;
  doc?: Document;
  onSubmit?: (projectId: string, doc: Partial<Document>) => void;
  onDelete?: () => void;
}

const DocumentEditForm = ({
  wsId,
  doc,
  onSubmit,
  onDelete,
}: DocumentEditFormProps) => {
  const { data: projects, error: projectsError } = useSWR<Document[]>(
    wsId ? `/api/orgs/${wsId}/projects` : null
  );

  useEffect(() => {
    if (projectsError)
      showNotification({
        title: 'Error',
        message: 'Failed to load projects',
        color: 'red',
      });
  }, [projectsError]);

  useEffect(() => {
    if (projects && projects.length > 0 && !doc?.project_id)
      setProjectId(projects[0].id);
  }, [projects, doc?.project_id]);

  const [projectId, setProjectId] = useState<string | null | undefined>(
    doc?.project_id
  );
  const [name, setName] = useState(doc?.name || '');

  return (
    <>
      <Select
        label="Project"
        placeholder="Select project"
        value={projectId}
        onChange={(id) => setProjectId(id)}
        data-autofocus
        data={
          projects
            ? projects?.map((project) => ({
                label: project?.name || 'Untitled Project',
                value: project.id,
              }))
            : []
        }
        disabled={!projects || !!doc?.project_id}
        className="mb-2"
      />

      <TextInput
        label="Document name"
        placeholder="Enter document name"
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          setName(event.currentTarget.value)
        }
        data-autofocus
      />

      <div className="flex gap-2">
        {doc?.id && onDelete && (
          <Button
            fullWidth
            variant="subtle"
            color="red"
            onClick={onDelete}
            mt="md"
          >
            Delete
          </Button>
        )}
        <Button
          fullWidth
          variant="subtle"
          onClick={() => {
            if (!projectId) return;
            const newDocument = { id: doc?.id || undefined, name };
            if (onSubmit) onSubmit(projectId, newDocument);
            closeAllModals();
          }}
          mt="md"
          disabled={!projectId}
        >
          {doc?.id ? 'Save' : 'Add'}
        </Button>
      </div>
    </>
  );
};

export default DocumentEditForm;
