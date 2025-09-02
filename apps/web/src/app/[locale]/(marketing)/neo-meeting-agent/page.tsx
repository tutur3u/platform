import GradientHeadline from '../gradient-headline';
import NeoMeetingAgentLanding from './landing';
import { Separator } from '@ncthub/ui/separator';
import { getTranslations } from 'next-intl/server';

export default async function NeoMeetingAgentPage() {
  const t = await getTranslations('neo-meeting-agent');

  return (
    <div className="flex w-full flex-col items-center">
      <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
        <div className="flex flex-col items-center gap-4">
          <h1 className="mx-auto text-center text-2xl font-bold text-foreground md:text-4xl lg:text-6xl">
            NEO Meeting Agent
          </h1>
          <p className="mx-auto max-w-2xl text-2xl font-semibold">
            {t('headline-p1')}{' '}
            <GradientHeadline gradient="yellow-orange">
              {t('headline-p2')}
            </GradientHeadline>
          </p>
        </div>

        <div className="mt-12">
          <NeoMeetingAgentLanding />
        </div>
      </div>
      <Separator className="mt-8 mb-4 md:mt-16" />
    </div>
  );
}
