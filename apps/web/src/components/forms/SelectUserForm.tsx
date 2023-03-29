import { Text, Button, Autocomplete, Avatar, Group } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { closeAllModals } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import React, { forwardRef, useEffect, useState } from 'react';
import { mutate } from 'swr';
import { User } from '../../types/primitives/User';
import {
  isEmail,
  isIncompleteEmail,
  suggestEmails,
} from '../../utils/email-helper';

interface SelectUserFormProps {
  wsId: string;
}

type UserWithValue = User & { value: string };

const SelectUserForm = ({ wsId }: SelectUserFormProps) => {
  const [value, setValue] = useState('');
  const [debounced] = useDebouncedValue(value, 300);

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [suggestions, setSuggestions] = useState<UserWithValue[]>([]);

  useEffect(() => {
    const fetchUsers = async (value: string) => {
      if (!value) return [];
      const response = await fetch(`/api/users/search?query=${value}`);

      if (response.ok) {
        const data = await response.json();
        return data;
      }

      return [];
    };

    const fetchData = async (input: string) => {
      if (isIncompleteEmail(input)) {
        const suggestedEmails = suggestEmails(input);
        setSuggestions(
          suggestedEmails.map((email) => ({
            id: email,
            value: email,
          }))
        );
        return;
      }

      const users = await fetchUsers(input);
      const suggestedUsers = users.map((user: User) => ({
        ...user,
        value: user?.handle || user?.email,
      }));

      setSuggestions(suggestedUsers);
    };

    if (debounced) fetchData(debounced);
  }, [debounced]);

  // eslint-disable-next-line react/display-name
  const AutoCompleteItem = forwardRef<HTMLDivElement, UserWithValue>(
    (
      { id, value, handle, avatar_url, display_name, ...others }: UserWithValue,
      ref
    ) =>
      id === value ? (
        <div {...others} ref={ref}>
          <Text>{value}</Text>
        </div>
      ) : (
        <div ref={ref} {...others}>
          <Group noWrap>
            <Avatar src={avatar_url} />

            <div>
              <Text>{display_name}</Text>
              <Text size="xs" color="dimmed">
                {handle ? `@${handle}` : 'No handle'}
              </Text>
            </div>
          </Group>
        </div>
      )
  );

  const [inviting, setInviting] = useState(false);

  const handleInvite = async () => {
    setInviting(true);

    const response = await fetch(`/api/workspaces/${wsId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: selectedUser?.id === value ? undefined : selectedUser?.id,
        email: value,
      }),
    });

    if (response.ok) {
      mutate(`/api/workspaces/${wsId}/members`);
      setValue('');
      setSelectedUser(null);
      closeAllModals();

      showNotification({
        title: 'Invitation sent',
        message: `Invitation to ${
          (selectedUser?.handle && `@${selectedUser?.handle}`) ||
          selectedUser?.display_name ||
          value
        } has been sent`,
        color: 'teal',
      });
    } else {
      const res = await response.json();
      showNotification({
        title: 'Could not invite user',
        message: res?.error?.message || 'Something went wrong',
        color: 'red',
      });
    }

    setInviting(false);
  };

  return (
    <>
      {!selectedUser ? (
        <Autocomplete
          value={value}
          onChange={setValue}
          placeholder="Enter an handle or email"
          itemComponent={AutoCompleteItem}
          data={suggestions}
          onItemSubmit={(item) => {
            const { value, ...user } = item as UserWithValue;
            setValue(value);
            setSelectedUser(user);
          }}
          data-autofocus
        />
      ) : (
        <Group className="rounded-lg border border-zinc-800/80 bg-blue-300/10 p-4">
          {selectedUser?.id === value ? (
            <Text>{value}</Text>
          ) : (
            <>
              <Avatar
                src={selectedUser.avatar_url}
                radius="md"
                className="bg-blue-300/20"
              />
              <div>
                <Text weight="bold" className="text-blue-200">
                  {selectedUser.display_name}
                </Text>
                <Text weight="light" className="text-blue-100">
                  @{selectedUser.handle}
                </Text>
              </div>
            </>
          )}
        </Group>
      )}

      <div>
        {isEmail(value) ? (
          <Button
            fullWidth
            variant="subtle"
            color="teal"
            onClick={handleInvite}
            loading={inviting}
            mt="md"
          >
            {inviting ? 'Inviting...' : 'Invite'}
          </Button>
        ) : (
          <Button
            fullWidth
            variant="subtle"
            color="teal"
            onClick={handleInvite}
            loading={inviting}
            mt="md"
            disabled={!selectedUser}
          >
            {inviting ? 'Inviting...' : 'Invite'}
          </Button>
        )}
      </div>
    </>
  );
};

export default SelectUserForm;
