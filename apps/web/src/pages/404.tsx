import React, { ReactElement } from 'react';
import { PageWithLayoutProps } from '../types/PageWithLayoutProps';
import Layout from '../components/layouts/DefaultLayout';
import Link from 'next/link';
import useTranslation from 'next-translate/useTranslation';

const Error404Page: PageWithLayoutProps = () => {
  const { t } = useTranslation('common');

  const msg = t('404-msg');
  const backToHome = t('back-to-home');

  return (
    <div className="absolute inset-0 mx-4 mb-8 mt-24 flex flex-col items-center justify-center text-center md:mx-32 lg:mx-64">
      <h1 className="text-9xl font-bold">
        <span className="text-orange-500 dark:text-orange-300">4</span>
        <span className="text-green-500 dark:text-green-300">0</span>
        <span className="text-red-500 dark:text-red-300">4</span>
      </h1>
      <p className="text-xl font-semibold text-zinc-700 dark:text-zinc-300">
        {msg}
      </p>

      <Link
        href="/onboarding"
        className="mt-4 block w-fit rounded-lg bg-blue-500/10 px-8 py-2 font-semibold text-blue-500 transition duration-300 hover:bg-blue-500/20 dark:bg-blue-300/20 dark:text-blue-300 dark:hover:bg-blue-300/30"
      >
        {backToHome}
      </Link>
    </div>
  );
};

Error404Page.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default Error404Page;
