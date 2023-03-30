import { showNotification } from '@mantine/notifications';
import { createContext, useContext, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { useUser as useSupabaseUser } from '@supabase/auth-helpers-react';
import { DEV_MODE } from '../constants/common';
import { User } from '../types/primitives/User';

const UserDataContext = createContext({
  user: undefined as User | undefined,
  updateUser: undefined as ((data: Partial<User>) => Promise<void>) | undefined,

  isLoading: true,
  isError: false,
});

export const UserDataProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const sbUser = useSupabaseUser();

  const apiPath = sbUser ? '/api/user' : null;
  const { data: user, error: userError } = useSWR<User>(apiPath);

  const isLoading = !user && !userError;

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
    if (userError) {
      showNotification({
        title: 'Failed to fetch user data',
        message: 'Please try again later',
        color: 'red',
      });
    }
  }, [userError]);

  const updateUser = async (data: Partial<User>) => {
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

  const values = {
    user,
    updateUser,

    isLoading,
    isError: !!userError,
  };

  return (
    <UserDataContext.Provider value={values}>
      {children}
    </UserDataContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserDataContext);

  if (context === undefined)
    throw new Error(`useUser() must be used within a UserDataProvider.`);

  return context;
};
