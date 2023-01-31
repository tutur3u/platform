import { ReactElement } from "react";
import DefaultHead from "../components/headers/DefaultHead";
import DefaultLayout from "../components/layouts/DefaultLayout";
import { PageWithLayoutProps } from "../types/PageWithLayoutProps";

const HomePage: PageWithLayoutProps = () => {
  return (
    <>
      <DefaultHead />

      <div className="w-full text-center text-9xl font-bold mt-64 text-blue-300">
        Coming soon
      </div>
    </>
  );
};

HomePage.getLayout = function getLayout(page: ReactElement) {
  return <DefaultLayout>{page}</DefaultLayout>;
};

export default HomePage;
