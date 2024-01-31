import useTranslation from 'next-translate/useTranslation';
import Form from './form';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';

export default async function MarketingPage() {
  const { t } = useTranslation('meet-together');

  const plans: MeetTogetherPlan[] = [
    // {
    //   id: '1',
    //   title: 'Plan 1',
    //   description: 'Description 1',
    //   timezone: -5,
    // },
    // {
    //   id: '2',
    //   title: 'Plan 2',
    //   description: 'Description 2',
    //   timezone: 0,
    // },
    // {
    //   id: '3',
    //   title: 'Plan 3',
    //   description: 'Description 3',
    //   timezone: 7,
    // },
  ];

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

      <Form />

      <Separator className="mb-4 mt-8 md:mt-16" />

      <div className="text-foreground grid w-full items-center justify-center p-4 pb-8">
        <h2 className="text-center text-2xl font-bold">{t('your_plans')}</h2>

        {plans?.length > 0 ? (
          <div className="mt-8 grid w-full max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan: MeetTogetherPlan) => (
              <Link
                href={`/calendar/meet-together/plans/${plan.id}`}
                key={plan.title}
                className="border-foreground/20 hover:border-foreground group relative flex flex-col rounded-lg border p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold">{plan.title}</h3>
                  {plan?.timezone != undefined && (
                    <div className="bg-foreground text-background rounded px-2 py-0.5 text-sm font-semibold">
                      GMT
                      {Intl.NumberFormat('en-US', {
                        signDisplay: 'always',
                      }).format(plan.timezone)}
                    </div>
                  )}
                </div>
                <div className="flex grow flex-col justify-between gap-4">
                  <p className="text-sm opacity-80">{plan.description}</p>
                  <div className="opacity-60 group-hover:opacity-100">
                    24-01-2024
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-center text-sm opacity-60">
            {t('no_plans_yet')}
          </p>
        )}
      </div>
    </div>
  );
}
