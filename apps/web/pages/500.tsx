import React, { ReactElement } from "react";
import { PageWithLayoutProps } from "../types/PageWithLayoutProps";
import Layout from "../components/layouts";
import Link from "next/link";

const Error500Page: PageWithLayoutProps = () => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center mt-24 mb-8 mx-4 md:mx-32 lg:mx-64 text-center">
      <h1 className="text-9xl font-bold">
        <span className="text-orange-300">5</span>
        <span className="text-green-300">0</span>
        <span className="text-red-300">0</span>
      </h1>
      <p className="text-xl text-zinc-300 font-semibold">
        Something went wrong. Please try again later.
      </p>

      <Link
        href="/"
        className="block w-fit mt-4 bg-blue-300/20 hover:bg-blue-300/30 text-blue-300 hover:text-blue-200 rounded-lg px-8 py-2 font-semibold transition duration-300"
      >
        Go back to home
      </Link>
    </div>
  );
};

Error500Page.getLayout = function getLayout(page: ReactElement) {
  return <Layout hideSlogan>{page}</Layout>;
};

export default Error500Page;
