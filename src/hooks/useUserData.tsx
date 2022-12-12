import { showNotification } from '@mantine/notifications';
import { createContext, useContext, useEffect } from 'react';
import { UserData } from '../types/primitives/UserData';
import useSWR, { mutate } from 'swr';

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
  const { data, error } = useSWR('/api/user');
  const isLoading = !data && !error;

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
    if (data?.username?.length) {
      if (data.username.length < 3 || data.username.length > 20) {
        showNotification({
          title: 'Invalid username',
          message: 'Username must be between 3 and 20 characters',
          color: 'red',
        });
        return;
      }

      if (!/^[a-zA-Z0-9_]+$/.test(data.username)) {
        showNotification({
          title: 'Invalid username',
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
        message: 'Please choose another username',
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
    username?: string;
    display_name?: string;
    created_at?: string;
  }) => {
    if (!data) return null;
    return {
      id: data.id,
      email: data.email,
      username: data.username,
      displayName: data.display_name,
      createdAt: data.created_at,
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
