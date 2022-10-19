import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { APP_VERSION, AUTH_URL } from '../core/constants';
import { authenticated } from '../utils/auth-helper';

const Home: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    if (authenticated() || !router) return;

    // Construct the auth URL
    const params = `nextUrl=${window.location.href}`;
    const nextUrl = `${AUTH_URL}?${params}`;

    // Redirect to the auth URL
    router.push(nextUrl);
  }, [router]);

  return (
    <h1 className="h-screen w-screen bg-zinc-900 text-white flex items-center justify-center text-6xl font-semibold">
      Application v{APP_VERSION}
    </h1>
  );
};

export default Home;
