import { Button, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import React, { useState } from 'react';
import { ChangeEvent } from 'react';
import { Document } from '../../types/primitives/Document';

interface DocumentEditFormProps {
  doc?: Document;
  onSubmit?: (doc: Partial<Document>) => void;
  onDelete?: () => void;
}

const DocumentEditForm = ({
  doc,
  onSubmit,
  onDelete,
}: DocumentEditFormProps) => {
  const [name, setName] = useState(doc?.name || '');

  return (
    <>
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
            const newDocument = { id: doc?.id || undefined, name };
            if (onSubmit) onSubmit(newDocument);
            closeAllModals();
          }}
          mt="md"
        >
          {doc?.id ? 'Save' : 'Add'}
        </Button>
      </div>
    </>
  );
};

export default DocumentEditForm;
