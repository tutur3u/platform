import Head from 'next/head';

const HeaderX = ({ label }: { label: string }) => {
  return (
    <Head>
      <title>{label}</title>
    </Head>
  );
};

export default HeaderX;
