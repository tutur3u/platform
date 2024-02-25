'use client';

import { Text, Button, Autocomplete, Avatar, Group } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { closeAllModals } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import React, { forwardRef, useEffect, useState } from 'react';
import { mutate } from 'swr';
import { User } from '@/types/primitives/User';
import {
  isEmail,
  isIncompleteEmail,
  suggestEmails,
} from '@/utils/email-helper';
import useTranslation from 'next-translate/useTranslation';
import { getInitials } from '@/utils/name-helper';

interface SelectUserFormProps {
  wsId: string;
  onComplete?: () => void;
}

type UserWithValue = User & { value: string };

const SelectUserForm = ({ wsId, onComplete }: SelectUserFormProps) => {
  const { t } = useTranslation('ws-members');

  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 300);

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [suggestions, setSuggestions] = useState<UserWithValue[]>([]);

  useEffect(() => {
    const fetchUsers = async (value: string) => {
      if (!value) return [];
      const response = await fetch(`/api/users/search?query=${value.trim()}`);

      if (response.ok) {
        const data = await response.json();
        return (data || []) as User[];
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

      const suggestedUsers = (users?.map((user: User) => ({
        ...user,
        value:
          `${user?.display_name} ${user?.handle}`.trim() || t('common:unknown'),
      })) || []) as UserWithValue[];

      setSuggestions(suggestedUsers);
    };

    fetchData(debounced);
  }, [t, debounced]);

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
          <div className="flex items-center gap-2">
            <Avatar
              alt="Avatar"
              src={avatar_url}
              size="lg"
              color="blue"
              className="aspect-square rounded-full text-xl"
            >
              {getInitials(display_name || '?')}
            </Avatar>

            <div>
              <Text className="font-semibold text-zinc-900 lg:text-lg dark:text-zinc-200">
                {display_name}
              </Text>
              <Text
                size="xs"
                color="dimmed"
                className="font-semibold text-blue-600 dark:text-blue-300"
              >
                {handle ? `@${handle}` : 'No handle'}
              </Text>
            </div>
          </div>
        </div>
      )
  );

  AutoCompleteItem.displayName = 'AutoCompleteItem';

  const [inviting, setInviting] = useState(false);

  const handleInvite = async () => {
    setInviting(true);

    const response = await fetch(`/api/workspaces/${wsId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: selectedUser?.id === query ? undefined : selectedUser?.id,
        email: query,
      }),
    });

    if (response.ok) {
      onComplete?.();

      mutate(`/api/workspaces/${wsId}/members`);
      mutate(`/api/workspaces/${wsId}/members/invites`);

      setQuery('');
      setSelectedUser(null);
      closeAllModals();

      showNotification({
        title: t('invitation_sent'),
        message: `${t('invitation_to')} ${
          (selectedUser?.handle && `@${selectedUser?.handle}`) ||
          selectedUser?.display_name ||
          query
        } ${t('has_been_sent')}`,
        color: 'teal',
      });
    } else {
      const res = await response.json();
      const error = res?.error?.message || res?.error || res?.message;

      if (error == 'Could not find user') {
        showNotification({
          title: t('invitation_error'),
          message: t('invitation_error_user_not_found'),
          color: 'red',
        });
      } else
        showNotification({
          title: t('invitation_error'),
          message: t('invitation_error_already_exist'),
          color: 'red',
        });
    }

    setInviting(false);
  };

  return (
    <>
      {selectedUser ? (
        <Group className="rounded border border-zinc-800/30 bg-zinc-300/5 px-4 py-2 text-zinc-300 dark:border-zinc-300/10">
          {selectedUser?.id === query ? (
            <Text className="font-semibold text-blue-600 dark:text-blue-300">
              {query}
            </Text>
          ) : (
            <div className="flex items-center gap-2">
              <Avatar
                alt="Avatar"
                src={selectedUser?.avatar_url}
                size="lg"
                color="blue"
                className="aspect-square rounded-full text-xl"
              >
                {getInitials(selectedUser?.display_name || '?')}
              </Avatar>
              <div>
                <Text
                  weight="bold"
                  className="font-semibold text-zinc-900 lg:text-lg xl:text-xl dark:text-zinc-200"
                >
                  {selectedUser.display_name}
                </Text>
                <Text
                  weight="light"
                  className="font-semibold text-blue-600 dark:text-blue-300"
                >
                  @{selectedUser.handle}
                </Text>
              </div>
            </div>
          )}
        </Group>
      ) : (
        <Autocomplete
          value={query}
          onChange={setQuery}
          placeholder={t('enter_email_or_username')}
          itemComponent={AutoCompleteItem}
          data={suggestions}
          onItemSubmit={(item) => {
            const { value, ...user } = item as UserWithValue;
            setSelectedUser(user);
          }}
          data-autofocus
          withinPortal
        />
      )}

      <Button
        fullWidth
        variant="light"
        className="border border-blue-800/30 bg-blue-300/10 hover:bg-blue-300/20 dark:border-blue-300/10"
        onClick={handleInvite}
        loading={inviting}
        disabled={!selectedUser && !isEmail(query)}
        mt="xs"
      >
        {t('invite_member')}
      </Button>
    </>
  );
};

export default SelectUserForm;
