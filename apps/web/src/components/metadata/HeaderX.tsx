import Head from 'next/head';

const HeaderX = ({
  label,
  disableBranding,
}: {
  label: string;
  disableBranding?: boolean;
}) => {
  const trailing = disableBranding ? '' : ` – Tuturuuu`;

  return (
    <Head>
      <title>{`${label}${trailing}`}</title>
    </Head>
  );
};

export default HeaderX;
