import React, { ReactElement } from 'react';
import { PageWithLayoutProps } from '../types/PageWithLayoutProps';
import Link from 'next/link';
import DefaultLayout from '../components/layout/DefaultLayout';

const Error500Page: PageWithLayoutProps = () => {
  return (
    <div className="absolute inset-0 mx-4 mt-24 mb-8 flex flex-col items-center justify-center text-center md:mx-32 lg:mx-64">
      <h1 className="text-9xl font-bold">
        <span className="text-orange-300">5</span>
        <span className="text-green-300">0</span>
        <span className="text-red-300">0</span>
      </h1>
      <p className="text-xl font-semibold text-zinc-300">
        Something went wrong. Please try again later.
      </p>

      <Link
        href="/"
        className="mt-4 block w-fit rounded-lg bg-blue-300/20 px-8 py-2 font-semibold text-blue-300 transition duration-300 hover:bg-blue-300/30 hover:text-blue-200"
      >
        Go back to home
      </Link>
    </div>
  );
};

Error500Page.getLayout = function getLayout(page: ReactElement) {
  return <DefaultLayout hideSlogan>{page}</DefaultLayout>;
};

export default Error500Page;
