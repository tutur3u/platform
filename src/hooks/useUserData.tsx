import { useUser } from '@supabase/auth-helpers-react';
import { createContext, useContext, useEffect, useState } from 'react';
import { UserData } from '../types/primitives/UserData';

const UserDataContext = createContext({
  isLoading: true,
  data: null as UserData | null,
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
    });
  };

  useEffect(() => {
    if (user) fetchUserData();
  }, [user]);

  const values = {
    isLoading: !data,
    data,
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
