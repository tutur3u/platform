import { showNotification } from '@mantine/notifications';
import { createContext, useContext, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import {
  useSupabaseClient,
  useUser as useSupabaseUser,
} from '@supabase/auth-helpers-react';
import { User } from '../types/primitives/User';
import { useRouter } from 'next/router';
import { v4 as uuidv4 } from 'uuid';

const UserDataContext = createContext({
  user: undefined as User | undefined,
  updateUser: undefined as ((data: Partial<User>) => Promise<void>) | undefined,
  uploadImageUserBucket: undefined as
    | ((file: File) => Promise<string | null>)
    | undefined,
  isLoading: true,
  isError: false,
});

export const UserDataProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const router = useRouter();

  const supabase = useSupabaseClient();
  const supabaseUser = useSupabaseUser();

  const apiPath = supabaseUser ? '/api/user' : null;

  const {
    data: user,
    error: userError,
    mutate: userMutate,
  } = useSWR<User>(apiPath, {
    onError: () => {
      userMutate(undefined);
    },
  });

  const isLoading = !user && !userError;

  useEffect(() => {
    const syncData = async () => {
      mutate('/api/user');
      mutate('/api/workspaces/invited');
    };

    const removeData = async () => {
      mutate('/api/user', null);
      mutate('/api/workspaces/invited', null);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const isAuthenticated =
        event === 'SIGNED_IN' ||
        event === 'INITIAL_SESSION' ||
        event === 'TOKEN_REFRESHED';

      const isSignedOut = event === 'SIGNED_OUT';

      if (isAuthenticated && session) syncData();
      else if (isSignedOut) removeData();
    });

    return () => subscription?.unsubscribe();
  }, [supabase.auth, router]);

  const uploadImageUserBucket = async (file: File): Promise<string | null> => {
    const idAvatar = uuidv4();
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(`${idAvatar}`, file);

    if (error) {
      showNotification({
        title: 'Failed to upload image',
        message: 'Please try again later',
        color: 'red',
      });
      return null;
    }

    console.log('upload image success', data);

    const { data: avatar } = supabase.storage
      .from('avatars')
      .getPublicUrl(`${idAvatar}`);

    return avatar.publicUrl;
  };

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

      if (!/^[a-z0-9_-]+$/.test(data.handle)) {
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
    uploadImageUserBucket,
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
