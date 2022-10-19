import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { APP_VERSION, AUTH_URL } from '../core/constants';
import { authenticated } from '../utils/auth-helper';

import type { ReactElement } from 'react';
import { PageWithLayoutProps } from '../types/PageWithLayoutProps';
import Layout from '../components//layout/Layout';

const Home: PageWithLayoutProps = () => {
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
    <>
    <div className=" bg-zinc-900 text-white flex items-center justify-center text-6xl font-semibold">
      Application v{APP_VERSION}
    </div>
    </>
  );
};

Home.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default Home;
