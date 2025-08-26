import GradientHeadline from '@/app/[locale]/(marketing)/gradient-headline';
import { Separator } from '@ncthub/ui/separator';
import { getTranslations } from 'next-intl/server';

export default async function NeoMeetingAgentPage() {
  const t = await getTranslations('neo-meeting-agent');

  return (
    <div className="flex w-full flex-col items-center">
      <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
        <div className="flex flex-col items-center">
          <h1 className="mx-auto mb-2 text-center text-2xl leading-tight! font-bold tracking-tight text-balance text-foreground md:text-4xl lg:text-6xl">
            {t('headline-p1')}{' '}
            <GradientHeadline gradient="yellow-orange">
              {t('headline-p2')}
            </GradientHeadline>
          </h1>
        </div>
      </div>
      <Separator className="mt-8 mb-4 md:mt-16" />
    </div>
  );
}
