import useTranslation from 'next-translate/useTranslation';
import Form from './form';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';
import {
  User,
  createServerComponentClient,
} from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import { cookies } from 'next/headers';
import dayjs from 'dayjs';

export const dynamic = 'force-dynamic';

interface Props {
  // params: {
  //   wsId: string;
  // };
  searchParams: {
    q: string;
    // page: string;
    // pageSize: string;
  };
}

export default async function MeetTogetherPage({
  // params: { wsId },
  searchParams,
}: Props) {
  const { t } = useTranslation('meet-together');
  const { data: plans, count: _, user } = await getData(searchParams);

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

      <div className="text-foreground flex w-full flex-col items-center justify-center p-4 pb-8">
        <h2 className="text-center text-2xl font-bold">{t('your_plans')}</h2>

        {plans?.length > 0 ? (
          <div className="mt-4 grid w-full max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan: MeetTogetherPlan) => (
              <Link
                href={`/calendar/meet-together/plans/${plan.id?.replace(
                  /-/g,
                  ''
                )}`}
                key={plan.name}
                className="border-foreground/20 hover:border-foreground group grid w-full rounded-lg border p-4"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <h3 className="line-clamp-1 w-full flex-1 font-bold">
                    {plan.name}
                  </h3>
                  {plan.start_time && (
                    <div className="bg-foreground text-background rounded px-2 py-0.5 text-sm font-semibold">
                      GMT
                      {Intl.NumberFormat('en-US', {
                        signDisplay: 'always',
                      }).format(
                        parseInt(plan.start_time?.split('+')?.[1] ?? 0)
                      )}
                    </div>
                  )}
                </div>

                <div className="flex grow flex-col justify-between gap-4">
                  {plan.description && (
                    <p className="text-sm opacity-80">{plan.description}</p>
                  )}

                  {plan.start_time && plan.end_time && (
                    <div className="opacity-60 group-hover:opacity-100">
                      <span className="font-semibold">
                        {timetzToTime(plan.start_time)} -{' '}
                        {timetzToTime(plan.end_time)}
                      </span>{' '}
                      ({t('local_time')})
                    </div>
                  )}
                </div>

                {plan.dates && plan.dates.length > 0 && (
                  <>
                    <Separator className="my-2" />
                    <div className="flex h-full flex-wrap gap-2 text-center">
                      {plan.dates?.slice(0, 5).map((date) => (
                        <div
                          key={date}
                          className={`bg-foreground/20 flex items-center justify-center rounded px-2 py-0.5 text-sm ${(plan.dates?.length || 0) <= 2 && 'w-full'}`}
                        >
                          {dayjs(date).format('MMM D (ddd)')}
                        </div>
                      ))}
                      {plan.dates.length > 5 && (
                        <div className="bg-foreground/20 rounded px-2 py-0.5 text-sm">
                          +{plan.dates.length - 5}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-center text-sm opacity-60">
            {user?.id ? t('no_plans_yet') : t('login_to_save_plans')}
          </p>
        )}
      </div>
    </div>
  );
}

function timetzToTime(timetz: string) {
  const [time, offsetStr] = timetz.split('+');
  const [hourStr, minuteStr] = time.split(':');

  const hour = parseInt(hourStr);
  const offset = parseInt(offsetStr);

  // get current user's timezone, then show the time in that timezone
  const date = new Date();
  const userOffset = date.getTimezoneOffset() / 60;

  const offsetDiff =
    offset * userOffset > 0 ? offset - userOffset : offset + userOffset;
  const hourDiff = hour - offsetDiff;

  return `${hourDiff}:${minuteStr.padStart(2, '0')}`;
}

async function getData(
  // wsId: string,
  {
    q,
    // page = '1',
    // pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: [], count: 0, user };

  const queryBuilder = supabase
    .from('meet_together_plans')
    .select('*', {
      count: 'exact',
    })
    .eq('creator_id', user.id);
  // .eq('ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);

  // if (
  // page &&
  // pageSize &&
  // typeof page === 'string' &&
  // typeof pageSize === 'string'
  // ) {
  // const parsedPage = parseInt(page);
  // const parsedSize = parseInt(pageSize);
  // const start = (parsedPage - 1) * parsedSize;
  // const end = parsedPage * parsedSize;
  // queryBuilder.range(start, end).limit(parsedSize);
  // }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count, user } as {
    data: MeetTogetherPlan[];
    count: number;
    user: User;
  };
}
