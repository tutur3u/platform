import { Session, User } from '@supabase/supabase-js';
import { useRouter } from 'next/router';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../clients/supabase';

const UserContext = createContext({
  isLoading: true,
  user: null as User | null,
  userData: null,
});

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  // Supabase-managed user session
  const [user, setUser] = useState<User | null>(null);

  // Custom user data
  const [userData, setUserData] = useState(null);

  const fetchUserData = async (session: Session) => {
    if (!session?.user) return;

    // const response = await fetch('/api/user');
    // const userData = await response.json();
    setUserData(null);
  };

  useEffect(() => {
    const updateSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.log(error);
        throw error;
      }

      const session = data?.session;
      if (session) await fetchUserData(session);

      const user = session?.user ?? null;
      setUser(user);
    };

    updateSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_, session) => {
        if (session) await fetchUserData(session);
        setUser(session?.user ?? null);
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [user?.id]);

  const values = {
    isLoading: !user || !userData,

    user,
    userData,
  };

  return <UserContext.Provider value={values}>{children}</UserContext.Provider>;
};

export const useUser = () => {
  const context = useContext(UserContext);

  if (context === undefined)
    throw new Error(`useUser() must be used within a UserProvider.`);

  return context;
};

export const signOut = async () => {
  await supabase.auth.signOut();
};

const AuthHandler = (requireUser: boolean, redirectUrl: string) => {
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!!user !== requireUser) router.push(redirectUrl);
  }, [user, router, redirectUrl, requireUser]);
};

export const AuthProtect = (redirectUrl?: string) => {
  const fallbackUrl = '/login';
  const url = redirectUrl ?? fallbackUrl;

  AuthHandler(true, url);
};

export const AuthRedirect = (redirectUrl?: string) => {
  const fallbackUrl = '/';
  const url = redirectUrl ?? fallbackUrl;

  AuthHandler(false, url);
};
