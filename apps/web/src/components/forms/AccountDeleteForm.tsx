import { User } from '@/types/primitives/User';
import { Button, TextInput } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';
import { useEffect, useState } from 'react';

interface Props {
  user: User;
  onDelete: () => void;
}

export default function AccountDeleteForm({ user, onDelete }: Props) {
  const { t } = useTranslation('settings-account');
  const [value, setValue] = useState('');
  const [isDisabled, setIsDisabled] = useState(true);

  useEffect(() => {
    if (value === user.email) {
      setIsDisabled(false);
    } else {
      setIsDisabled(true);
    }
  }, [value, user.email]);

  return (
    <div className="flex flex-col gap-2">
      <div>{t('delete-account-message')}</div>
      <TextInput
        value={value}
        placeholder={user.email}
        onChange={(event) => setValue(event.currentTarget.value)}
      />

      <Button
        fullWidth
        variant="light"
        className="border border-red-300/10 bg-red-300/10 transition hover:bg-red-300/20"
        color="red"
        onClick={() => {
          onDelete();
        }}
        disabled={isDisabled}
      >
        {t('common:delete')}
      </Button>
    </div>
  );
}
