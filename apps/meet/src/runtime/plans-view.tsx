import { Calendar, UserIcon, Users, Video, Zap } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { GradientHeadline } from '@tuturuuu/ui/custom/gradient-headline';
import { Separator } from '@tuturuuu/ui/separator';
import 'dayjs/locale/vi';
import 'dayjs/plugin/relativeTime';
import { MeetTogetherClient } from '@tuturuuu/ui/legacy/meet/client-wrapper';
import Form from '@tuturuuu/ui/legacy/meet/form';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { MeetPageModel } from './page-model.server';

type PlansModel = Extract<
  MeetPageModel,
  { kind: 'public-plans' | 'workspace-plans' }
>;
export function PlansView({ model }: { model: PlansModel }) {
  const {
    locale,
    paging: { page, pageSize },
    plans: { data: plans, user, totalCount },
  } = model;
  const wsId =
    model.kind === 'workspace-plans' ? model.workspace.wsId : undefined;
  const path = '/plans';
  const totalPages = Math.ceil(totalCount / pageSize);
  const t = useTranslations('meet-together');
  const tCommon = useTranslations('common');
  return (
    <div className="relative flex w-full flex-col items-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-20 -left-32 h-64 w-64 rounded-full bg-dynamic-blue/10 blur-3xl"></div>
        <div className="absolute top-32 -right-32 h-64 w-64 rounded-full bg-dynamic-purple/10 blur-3xl"></div>
        <div className="absolute bottom-1/3 left-1/4 h-40 w-40 rounded-full bg-dynamic-green/5 blur-2xl"></div>
      </div>
      <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-8 px-4 py-10 lg:flex-row lg:items-center lg:gap-12">
        <div className="flex flex-1 flex-col items-center text-center lg:items-start lg:text-left">
          <Badge variant="secondary" className="mb-6 px-4 py-2">
            <Video className="mr-2 h-4 w-4" />
            {t('meeting_coordination')}
          </Badge>
          <h1 className="mb-6 text-balance text-center font-bold text-4xl text-foreground leading-tight tracking-tight md:text-5xl lg:text-left lg:text-6xl">
            {t('headline-p1')}{' '}
            <GradientHeadline className="bg-linear-to-r from-dynamic-blue via-dynamic-purple to-dynamic-green bg-clip-text">
              {t('headline-p2')}
            </GradientHeadline>
          </h1>
          <p className="mb-8 max-w-2xl text-center text-foreground/70 text-lg leading-relaxed md:text-xl lg:text-left">
            {t('new_plan_desc')}
          </p>
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 rounded-lg bg-dynamic-blue/5 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-blue/10">
                <Calendar className="h-5 w-5 text-dynamic-blue" />
              </div>
              <div className="text-left">
                <p className="font-medium text-foreground text-sm">
                  {t('smart_scheduling')}
                </p>
                <p className="text-foreground/60 text-xs">
                  {t('automatic_coordination')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg bg-dynamic-purple/5 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-purple/10">
                <Users className="h-5 w-5 text-dynamic-purple" />
              </div>
              <div className="text-left">
                <p className="font-medium text-foreground text-sm">
                  {t('group_availability')}
                </p>
                <p className="text-foreground/60 text-xs">
                  {t('find_perfect_time')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg bg-dynamic-green/5 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-green/10">
                <Zap className="h-5 w-5 text-dynamic-green" />
              </div>
              <div className="text-left">
                <p className="font-medium text-foreground text-sm">
                  {t('instant_setup')}
                </p>
                <p className="text-foreground/60 text-xs">
                  {t('minutes_to_create')}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-2xl flex-1 lg:mx-0">
          <Card className="border-border/50 bg-accent/50 backdrop-blur-sm">
            <CardContent className="p-6 md:p-8">
              <Form
                wsId={wsId}
                planBasePath={path || '/meet/plans'}
                user={
                  user
                    ? {
                        id: user.id,
                        avatar_url: user.user_metadata?.avatar_url ?? null,
                        bio: user.user_metadata?.bio ?? null,
                        created_at: user.created_at ?? null,
                        display_name: user.user_metadata?.display_name ?? null,
                        handle: user.user_metadata?.handle ?? null,
                      }
                    : null
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator className="my-8 md:my-16" />
      <div className="flex w-full flex-col items-center justify-center px-4 pb-16">
        <div className="w-full max-w-6xl">
          <div className="mb-8 flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2 text-center sm:text-left">
                <h2 className="font-bold text-2xl text-foreground md:text-3xl">
                  {t('your_plans')}
                </h2>
                {totalCount > 0 && (
                  <p className="text-foreground/60 text-sm">
                    <span className="font-medium text-foreground">
                      {totalCount}
                    </span>{' '}
                    {tCommon('result(s)')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {user?.id ? (
            <MeetTogetherClient
              plans={plans}
              locale={locale}
              totalPages={totalPages}
              totalCount={totalCount}
              currentPage={page}
              pageSize={pageSize}
              user={user}
              path={path}
            />
          ) : (
            <Card className="border-border/50 bg-linear-to-br from-dynamic-blue/5 to-dynamic-purple/5">
              <CardContent className="flex flex-col items-center justify-center p-16">
                <div className="mb-8 rounded-full bg-dynamic-blue/10 p-8 shadow-sm">
                  <UserIcon className="h-8 w-8 text-dynamic-blue" />
                </div>
                <h3 className="mb-4 font-semibold text-foreground text-xl">
                  {t('login_required')}
                </h3>
                <p className="mb-6 max-w-md text-center text-foreground/70 text-sm leading-relaxed">
                  {t('login_required_desc')}
                </p>
                <div className="flex gap-4">
                  <Button asChild>
                    <Link href="/login">{tCommon('sign_in')}</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/register">{tCommon('create_account')}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
