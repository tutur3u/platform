import { Button, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import { User } from '../../types/primitives/User';
import { useEffect, useState } from 'react';

interface Props {
  user: User;
  onDelete: () => void;
}

export default function AccountDeleteForm({ user, onDelete }: Props) {
  const [value, setValue] = useState('');
  const [isDisabled, setIsDisabled] = useState(true);

  useEffect(() => {
    if (value === user.handle) {
      setIsDisabled(false);
    } else {
      setIsDisabled(true);
    }
  }, [value, user.handle]);

  return (
    <div className="flex flex-col gap-2">
      <div>
        This action cannot be undone. This will permanently delete user{' '}
        <span className="font-bold">{user.handle}</span> and all associated
      </div>
      <div>
        Type <span className="font-bold">{user.handle}</span> to confirm your
        account deletion
      </div>
      <TextInput
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      <div className="flex gap-2">
        <Button
          fullWidth
          variant="subtle"
          color="red"
          onClick={() => {
            onDelete();
          }}
          mt="md"
          disabled={isDisabled}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
