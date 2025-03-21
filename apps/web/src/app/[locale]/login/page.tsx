import LoginForm from './form';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { Suspense } from 'react';

export default async function Login() {
  const t = await getTranslations();

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center p-8 py-16 lg:py-32">
      <div className="grid max-w-md gap-2">
        <div className="flex items-center justify-center">
          <h1 className="relative flex w-fit items-center gap-2">
            <Image
              src="/media/logos/transparent.png"
              width={128}
              height={128}
              alt="Tuturuuu Logo"
            />
          </h1>
        </div>

        <Suspense fallback={<div>{t('common.loading')}...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
