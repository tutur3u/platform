import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

const Home: NextPage = () => {
  const router = useRouter();
  const devMode = process.env.NODE_ENV === 'development';

  const authProdUrl = 'https://auth.tuturuuu.com';
  const authDevUrl = 'http://localhost:7802';

  useEffect(() => {
    const cookie = document.cookie
      .split(';')
      .find((c) => c.includes('tuturuuu-auth'));

    if (!cookie) {
      router.push(
        (devMode ? authDevUrl : authProdUrl) +
          '?nextUrl=' +
          window.location.href
      );
    }
  }, [devMode, authDevUrl, authProdUrl, router]);

  return (
    <div className="h-screen w-screen bg-zinc-900 text-white flex items-center justify-center text-6xl font-semibold">
      Application
    </div>
  );
};

export default Home;
