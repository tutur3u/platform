import { showNotification } from '@mantine/notifications';
import { useUser } from '@supabase/auth-helpers-react';
import { createContext, useContext, useEffect, useState } from 'react';
import { UserData } from '../types/primitives/UserData';

const UserDataContext = createContext({
  isLoading: true,
  data: null as UserData | null,
  updateData: null as ((data: Partial<UserData>) => Promise<void>) | null,
});

export const UserDataProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const user = useUser();
  const [data, setData] = useState<UserData | null>(null);

  const fetchUserData = async () => {
    const response = await fetch('/api/user');
    const data = await response.json();

    setData({
      id: data.id,
      username: data.username,
      displayName: data.display_name,
      createdAt: data.created_at,
    });
  };

  useEffect(() => {
    if (user) fetchUserData();
  }, [user]);

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
      await fetchUserData();
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

  const values = {
    isLoading: !data,
    data,
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
