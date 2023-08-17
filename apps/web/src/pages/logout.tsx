import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import useTranslation from 'next-translate/useTranslation';
import HeaderX from '../components/metadata/HeaderX';
import Image from 'next/image';
import LanguageSelector from '../components/selectors/LanguageSelector';
import { Button, Divider } from '@mantine/core';
import { logout } from '../utils/auth-handler';
import { useRouter } from 'next/router';

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const supabase = createPagesServerClient(ctx);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session)
    return {
      redirect: {
        destination: '/',
        permanent: false,
      },
    };

  return {
    props: {},
  };
};

const LogOutPage = () => {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const { t } = useTranslation('logout');

  const logoutLabel = t('logout');
  const description = t('description');

  return (
    <>
      <HeaderX label={`Tuturuuu — ${logoutLabel}`} />
      <Image
        src="/media/background/auth-featured-bg.jpg"
        alt="Featured background"
        width={1619}
        height={1080}
        className="fixed inset-0 h-screen w-screen object-cover"
      />

      <div className="absolute inset-0 mx-4 my-32 flex items-start justify-center md:mx-4 md:items-center lg:mx-32">
        <div className="flex w-full max-w-xl flex-col items-center gap-4 rounded-xl bg-zinc-700/50 p-4 backdrop-blur-2xl md:p-8">
          <div className="text-center">
            <div className="bg-gradient-to-br from-yellow-200 via-green-200 to-green-300 bg-clip-text py-2 text-4xl font-semibold text-transparent md:text-5xl">
              {logoutLabel}
            </div>

            <div className="text-xl font-semibold text-zinc-200">
              {description}
            </div>
          </div>

          <div className="grid w-full gap-2 text-center">
            <Button
              className="border border-red-300/10 bg-red-300/10 text-red-300 hover:bg-red-300/20"
              variant="light"
              color="red"
              onClick={(e) => {
                e.preventDefault();
                logout({ supabase, router });
              }}
            >
              {logoutLabel}
            </Button>
          </div>

          <Divider className="w-full border-zinc-300/10" variant="dashed" />

          <LanguageSelector fullWidth transparent />
        </div>
      </div>
    </>
  );
};

export default LogOutPage;
