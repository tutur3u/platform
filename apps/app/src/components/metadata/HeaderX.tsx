import Head from 'next/head';

const HeaderX = ({ label }: { label: string }) => {
  return (
    <Head>
      <title>{`${label} – Tuturuuu`}</title>
    </Head>
  );
};

export default HeaderX;
