import { Button, Autocomplete } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import React, { useState } from 'react';
import { Project } from '../../types/primitives/Project';
import { isIncompleteEmail, suggestEmails } from '../../utils/email-helper';

interface SelectUserFormProps {
  onSubmit?: (orgId: string, project: Project) => void;
  onDelete?: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SelectUserForm = ({ onSubmit, onDelete }: SelectUserFormProps) => {
  const [value, setValue] = useState('');
  const [randomNames, setRandomNames] = useState<string[]>([]);

  const generateRandomNames = (value: string) => {
    // generate names that are similar to the value
    const names = Array.from({ length: 1000 }, () =>
      Array.from({ length: Math.floor(Math.random() * 8) + 3 }, () =>
        String.fromCharCode(Math.floor(Math.random() * 26) + 97)
      ).join('')
    ).map((name) => `${value || ''}${name}`);

    // shuffle array
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }

    setRandomNames(names);
  };

  const fetchData = async (value: string) => {
    if (isIncompleteEmail(value)) {
      const suggestions = suggestEmails(value);
      setRandomNames(suggestions);
      return;
    }

    if (value?.includes('@')) {
      setRandomNames([]);
      return;
    }

    // sleep for 300ms to simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 300));

    // fetch data from server
    generateRandomNames(value);
  };

  return (
    <>
      <Autocomplete
        placeholder="Enter an username or email"
        value={value}
        onChange={(value) => {
          setValue(value);
          fetchData(value);
        }}
        data={randomNames}
        data-autofocus
      />
      <div className="flex gap-2">
        <Button
          fullWidth
          variant="subtle"
          onClick={() => closeAllModals()}
          mt="md"
        >
          Cancel
        </Button>

        <Button
          fullWidth
          variant="subtle"
          onClick={() => closeAllModals()}
          mt="md"
        >
          Invite
        </Button>
      </div>
    </>
  );
};

export default SelectUserForm;
