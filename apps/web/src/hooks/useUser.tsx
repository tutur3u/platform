import { User } from '@/types/primitives/User';
import { showNotification } from '@mantine/notifications';
import {
  SupabaseClient,
  useUser as useSupabaseUser,
} from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';
import React, { createContext, useContext, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { v4 as uuidv4 } from 'uuid';

const UserDataContext = createContext({
  user: undefined as User | undefined,
  updateUser: undefined as ((data: Partial<User>) => Promise<void>) | undefined,
  uploadAvatar: undefined as
    | ((file: File) => Promise<string | null>)
    | undefined,
  isLoading: true,
  isError: false,
});

export const UserDataProvider = ({
  supabase,
  children,
}: {
  supabase: SupabaseClient;
  children: React.ReactNode;
}) => {
  const supabaseUser = useSupabaseUser();
  const router = useRouter();

  const apiPath = supabaseUser ? '/api/user' : null;

  const { data: user, error: userError } = useSWR<User>(apiPath);

  const isLoading = !user && !userError;

  useEffect(() => {
    const syncData = async () => {
      await mutate('/api/user');
      await mutate('/api/workspaces/invited');
    };

    const removeData = async () => {
      await mutate('/api/user', null);
      await mutate('/api/workspaces/invited', null);
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

  const uploadAvatar = async (file: File): Promise<string | null> => {
    const randomId = uuidv4();

    const { error } = await supabase.storage
      .from('avatars')
      .upload(`${randomId}`, file);

    if (error) {
      showNotification({
        title: 'Failed to upload image',
        message: 'Please try again later',
        color: 'red',
      });
      return null;
    }

    const { data: avatar } = supabase.storage
      .from('avatars')
      .getPublicUrl(`${randomId}`);

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
      await mutate('/api/user');
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
    uploadAvatar,
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
