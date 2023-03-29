import { showNotification } from '@mantine/notifications';
import { createContext, useContext, useEffect } from 'react';
import { UserData } from '../types/primitives/UserData';
import useSWR, { mutate } from 'swr';
import { useUser } from '@supabase/auth-helpers-react';
import { DEV_MODE } from '../constants/common';

const UserDataContext = createContext({
  isLoading: true,
  data: null as UserData | null | undefined,
  updateData: null as ((data: Partial<UserData>) => Promise<void>) | null,
});

export const UserDataProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const user = useUser();
  const { data, error } = useSWR(user ? '/api/user' : null);

  const isLoading = !data && !error;

  useEffect(() => {
    const setupLocalEnv = async () => {
      // Dynamically import the local environment helper.
      const { setup } = await import('../utils/dev/local-environment-helper');

      // Setup the local environment.
      await setup();
    };

    if (DEV_MODE && user) setupLocalEnv();
  }, [user]);

  useEffect(() => {
    if (error) {
      showNotification({
        title: 'Failed to fetch user data',
        message: 'Please try again later',
        color: 'red',
      });
    }
  }, [error]);

  const updateData = async (data: Partial<UserData>) => {
    if (data?.handle?.length) {
      if (data.handle.length < 3 || data.handle.length > 20) {
        showNotification({
          title: 'Invalid handle',
          message: 'Username must be between 3 and 20 characters',
          color: 'red',
        });
        return;
      }

      if (!/^[a-zA-Z0-9_]+$/.test(data.handle)) {
        showNotification({
          title: 'Invalid handle',
          message: 'Username can only contain letters, numbers and underscores',
          color: 'red',
        });
        return;
      }
    }

    const response = await fetch('/api/user', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      mutate('/api/user');
      showNotification({
        title: 'Updated profile',
        message: 'Your profile has been updated',
        color: 'teal',
      });
    } else if ((await response.json())?.error?.includes('duplicate key')) {
      showNotification({
        title: 'Username already taken',
        message: 'Please choose another handle',
        color: 'red',
      });
    } else {
      showNotification({
        title: 'Failed to update profile',
        message: 'Please try again later',
        color: 'red',
      });
    }
  };

  const parseData = (data?: {
    id: string;
    email?: string;
    handle?: string;
    birthday?: string;
    display_name?: string;
    created_at?: string;
  }) => {
    if (!data) return null;
    return {
      id: data.id,
      email: data.email,
      handle: data.handle,
      birthday: data.birthday,
      display_name: data.display_name,
      created_at: data.created_at,
    };
  };

  const values = {
    isLoading,
    data: parseData(data),
    updateData,
  };

  return (
    <UserDataContext.Provider value={values}>
      {children}
    </UserDataContext.Provider>
  );
};

export const useUserData = () => {
  const context = useContext(UserDataContext);

  if (context === undefined)
    throw new Error(`useUserData() must be used within a UserDataProvider.`);

  return context;
};
