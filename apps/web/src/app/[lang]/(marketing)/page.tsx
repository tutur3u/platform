import Link from 'next/link';
import { getFeatures } from './features';
import Image from 'next/image';
import useTranslation from 'next-translate/useTranslation';
import { getWorkspaces } from '@/lib/workspace-helper';
import GradientHeadline from './gradient-headline';
import GetStartedButton from './get-started-button';

export const dynamic = 'force-dynamic';

export default async function MarketingPage() {
  const { t } = useTranslation('home');

  const features = getFeatures(t);
  const workspaces = await getWorkspaces(true);

  return (
    <div className="flex w-full flex-col items-center">
      <div className="text-foreground mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
        <div className="mb-4 flex flex-col items-center lg:mb-12">
          <h1 className="relative mb-4 text-center text-4xl font-bold lg:text-7xl">
            <span className="sr-only">Tuturuuu</span>
            <Image
              src="/media/logos/transparent.png"
              width={160}
              height={160}
              alt="logo"
              priority
            />
          </h1>

          <p className="mx-auto my-4 max-w-xl text-center text-lg font-semibold !leading-tight md:mb-8 md:text-2xl lg:text-3xl">
            {t('headline-p1')} <br />
            <GradientHeadline />.
          </p>

          <GetStartedButton
            href={workspaces?.[0]?.id ? `/${workspaces?.[0]?.id}` : '/login'}
          />
        </div>

        <div className="via-foreground/10 w-full bg-gradient-to-r from-transparent to-transparent p-[1px]" />

        <div className="text-foreground flex flex-col gap-8">
          <h2 className="text-center font-bold md:text-lg">
            {t('features-lead')}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map(({ title, subtitle, url, icon }) => (
              <Link
                href={url || '#'}
                key={title}
                className="border-foreground/20 hover:border-foreground group relative flex flex-col rounded-lg border p-6"
              >
                <h3 className="min-h-[40px] font-bold">{title}</h3>
                <div className="flex grow flex-col justify-between gap-4">
                  <p className="text-sm opacity-80">{subtitle}</p>
                  <div className="opacity-60 group-hover:opacity-100">
                    {icon}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
