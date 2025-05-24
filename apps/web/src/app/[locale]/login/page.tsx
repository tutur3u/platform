import { DEV_MODE } from '@/constants/common';
import { XIcon } from '@tuturuuu/ui/icons';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import LoginForm from './form';

const externalDomains = {
  TUTURUUU: {
    name: 'Tuturuuu',
    domain: DEV_MODE ? 'localhost:7806' : 'tuturuuu.com',
    logo: '/media/logos/transparent.png',
  },
  UPSKII: {
    name: 'Upskii',
    domain: DEV_MODE ? 'localhost:7806' : 'upskii.com',
    logo: '/media/logos/transparent.png',
  },
  NOVA: {
    name: 'Nova',
    domain: DEV_MODE ? 'localhost:7805' : 'nova.ai.vn',
    logo: '/media/logos/transparent.png',
  },
} as const;

export default async function Login({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const t = await getTranslations();
  const returnUrl = (await searchParams).returnUrl as string | undefined;

  const getReturnUrlDomain = (url: string | undefined) => {
    if (!url) return null;
    try {
      const urlObj = new URL(url);
      return urlObj.host;
    } catch {
      return null;
    }
  };

  const returnUrlDomain = getReturnUrlDomain(returnUrl);
  const currentDomain = Object.values(externalDomains).find(
    (domain) => domain.domain === returnUrlDomain
  );

  const renderLogo = (domain: typeof externalDomains[keyof typeof externalDomains]) => (
    <Link href={domain.domain} className="group mb-2 flex items-center justify-center">
      <Image
        src={domain.logo}
        width={80}
        height={80}
        alt={`${domain.name} Logo`}
        className="transition-all duration-300 group-hover:scale-105"
      />
    </Link>
  );

  return (
    <div className="from-background to-background/90 bg-linear-to-b relative flex h-full w-full flex-col items-center justify-center p-6 py-16 sm:p-8 lg:py-32">
      <div className="bg-size-[24px_24px] fixed inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] opacity-70"></div>
      <div className="z-10 flex w-full max-w-[400px] flex-col items-center space-y-6">
        {currentDomain ? (
          <div className='grid grid-cols-3'>
            {currentDomain.name === externalDomains.TUTURUUU.name ? (
              renderLogo(externalDomains.TUTURUUU)
            ) : (
              <>
                {renderLogo(externalDomains.TUTURUUU)}
                <div className='flex items-center justify-center'>
                  <XIcon className='size-10' />
                </div>
                {renderLogo(currentDomain)}
              </>
            )}
          </div>
        ) : (
          renderLogo(externalDomains.TUTURUUU)
        )}

        <Suspense
          fallback={
            <div className="bg-muted/30 flex h-[400px] w-full animate-pulse items-center justify-center rounded-lg p-8">
              <div className="flex flex-col items-center gap-2">
                <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"></div>
                <span className="text-muted-foreground text-sm">
                  {t('common.loading')}...
                </span>
              </div>
            </div>
          }
        >
          <LoginForm />
        </Suspense>

        <div className="text-muted-foreground text-center text-sm">
          <span>{t('auth.notice-p1')} </span>
          <Link href="/terms" className="text-primary hover:underline">
            {t('auth.tos')}
          </Link>
          <span> {t('common.and')} </span>
          <Link href="/privacy" className="text-primary hover:underline">
            {t('auth.privacy')}
          </Link>
          <span> {t('auth.notice-p2')}.</span>
        </div>
      </div>
    </div>
  );
}
