import useTranslation from 'next-translate/useTranslation';
import DateSelector from './date-selector';
import { TimeSelector } from './time-selector';
import TimezoneSelector from './timezone-selector';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function MarketingPage() {
  const { t } = useTranslation('meet-together');

  // const workspaces = await getWorkspaces(true);

  return (
    <div className="flex w-full flex-col items-center">
      <div className="text-foreground mt-8 flex max-w-6xl flex-col gap-6 px-3 py-8 lg:gap-14">
        <div className="flex flex-col items-center">
          <p className="mx-auto my-4 max-w-xl text-center text-lg font-semibold !leading-tight md:mb-4 md:text-2xl lg:text-3xl">
            {t('headline-p1')}{' '}
            <span className="bg-gradient-to-r from-pink-500 via-yellow-500 to-sky-600 bg-clip-text text-transparent dark:from-pink-300 dark:via-amber-300 dark:to-blue-300">
              {t('headline-p2')}
            </span>
            .
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-8 text-center md:flex-row md:gap-16">
        <div className="grid justify-center gap-4">
          <p className="text-xl font-semibold">{t('dates-to-meet-together')}</p>
          <DateSelector />
        </div>

        <Separator className="hidden h-96 md:block" orientation="vertical" />

        <div className="grid w-full justify-stretch gap-2">
          <p className="w-full text-xl font-semibold">
            {t('soonest-time-to-meet')}
          </p>
          <TimeSelector defaultValue={9} />
          <p className="mt-4 w-full text-xl font-semibold">
            {t('latest-time-to-meet')}
          </p>
          <TimeSelector defaultValue={17} />

          <Separator className="my-4" />

          <p className="w-full text-xl font-semibold">{t('time-zone')}</p>
          <TimezoneSelector />

          <div className="group relative mt-4 inline-flex">
            <div className="animate-tilt absolute -inset-px rounded-lg bg-gradient-to-r from-rose-400 to-orange-300 opacity-70 blur-lg transition-all group-hover:-inset-1 group-hover:opacity-100 group-hover:duration-200 dark:from-rose-400/60 dark:to-orange-300/60"></div>
            <Link
              href="/login"
              className="relative inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-rose-400 to-orange-300 px-8 py-2 font-bold text-white transition-all md:text-lg dark:from-rose-400/60 dark:to-orange-300/60"
            >
              {t('create-plan')}
            </Link>
          </div>
        </div>
      </div>

      {/* <Separator className="mb-4 mt-8 md:mt-16" />

      <div className="text-foreground flex flex-col gap-8">
        <h2 className="text-center font-bold md:text-lg">Your plans</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="border-foreground/20 hover:border-foreground group relative flex flex-col rounded-lg border p-6">
            <h3 className="min-h-[40px] font-bold">Feature 1</h3>
            <div className="flex grow flex-col justify-between gap-4">
              <p className="text-sm opacity-80">Feature 1 description</p>
              <div className="opacity-60 group-hover:opacity-100">Icon 1</div>
            </div>
          </div>
          <div className="border-foreground/20 hover:border-foreground group relative flex flex-col rounded-lg border p-6">
            <h3 className="min-h-[40px] font-bold">Feature 2</h3>
            <div className="flex grow flex-col justify-between gap-4">
              <p className="text-sm opacity-80">Feature 2 description</p>
              <div className="opacity-60 group-hover:opacity-100">Icon 2</div>
            </div>
          </div>
          <div className="border-foreground/20 hover:border-foreground group relative flex flex-col rounded-lg border p-6">
            <h3 className="min-h-[40px] font-bold">Feature 3</h3>
            <div className="flex grow flex-col justify-between gap-4">
              <p className="text-sm opacity-80">Feature 3 description</p>
              <div className="opacity-60 group-hover:opacity-100">Icon 3</div>
            </div>
          </div>
        </div>
      </div> */}
    </div>
  );
}
