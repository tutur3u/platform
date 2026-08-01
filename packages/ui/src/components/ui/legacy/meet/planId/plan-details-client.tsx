'use client';

import {
  Activity,
  CalendarClock,
  CircleQuestionMark,
  Users,
} from '@tuturuuu/icons';
import type {
  MeetFinalizedTimeframe,
  MeetTogetherPlan,
  PlanUser,
} from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { GetPollsForPlanResult } from '@tuturuuu/types/primitives/Poll';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { Badge } from '@tuturuuu/ui/badge';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { Label } from '@tuturuuu/ui/label';
import EditPlanDialog from '@tuturuuu/ui/legacy/meet/edit-plan-dialog';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useCallback, useState } from 'react';
import AgendaDetails from './agenda-details';
import { MeetInsightsPanel } from './meet-insights-panel';
import { MeetSuggestionsPanel } from './meet-suggestions-panel';
import PlanLogin from './plan-login';
import SidebarDisplay from './sidebar-display';
import StickyBottomIndicator from './sticky-bottom-indicator';
import UnifiedAvailability from './unified-availability';
import UtilityButtons from './utility-buttons';

interface PlanDetailsClientProps {
  plan: MeetTogetherPlan;
  polls: GetPollsForPlanResult | null;
  users: PlanUser[];
  timeblocks: Timeblock[];
  finalizedTimeframes: MeetFinalizedTimeframe[];
  isCreator: boolean;
  isRefreshing: boolean;
  baseUrl: string;
}

export default function PlanDetailsClient({
  plan,
  users,
  polls,
  timeblocks,
  finalizedTimeframes,
  isCreator,
  isRefreshing,
  baseUrl,
}: PlanDetailsClientProps) {
  const { resolvedTheme } = useTheme();
  const t = useTranslations('meet-together-plan-details');
  const [showBestTimes, setShowBestTimes] = useState(false);
  const { filteredUserIds, isDirty, resetLocalTimeblocks, user } =
    useTimeBlocking();
  const isUserFilterActive = filteredUserIds.length > 0;

  const downloadAsPNG = useCallback(async () => {
    const element = document.getElementById('plan-ref');
    if (!element) throw new Error('Plan element not found');
    const html2canvas = (await import('html2canvas-pro')).default;
    const canvas = await html2canvas(element, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: resolvedTheme === 'dark' ? '#0a0a0a' : '#ffffff',
      scale: 1,
      logging: false,
    });
    const link = document.createElement('a');
    link.download = `tuturuuu-meet-${plan.id}.png`;
    link.href = canvas.toDataURL('image/png', 2);
    link.click();
  }, [plan.id, resolvedTheme]);

  return (
    <>
      <main className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-72 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.10),transparent_52%)]" />
        <div className="relative mx-auto flex w-full max-w-[1560px] flex-col gap-5 px-3 py-4 sm:px-5 lg:px-8">
          <header className="rounded-2xl border bg-background/90 p-4 shadow-sm backdrop-blur-xl sm:p-5">
            <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge variant={plan.is_confirmed ? 'default' : 'secondary'}>
                    {plan.is_confirmed
                      ? t('finalized')
                      : t('collecting_availability')}
                  </Badge>
                  <Badge variant="outline" className="tabular-nums">
                    {t('minutes_short', { count: plan.duration_minutes ?? 60 })}
                  </Badge>
                  <Badge variant="outline">
                    {plan.timezone || t('legacy_fixed_offset')}
                  </Badge>
                  <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <span
                      className={
                        isRefreshing
                          ? 'h-1.5 w-1.5 animate-pulse rounded-full bg-primary'
                          : 'h-1.5 w-1.5 rounded-full bg-muted-foreground/40'
                      }
                    />
                    {isRefreshing ? t('refreshing') : t('up_to_date')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <h1 className="text-balance font-semibold text-2xl tracking-tight sm:text-3xl">
                    {plan.name || t('untitled_meeting')}
                  </h1>
                  {user?.id === plan.creator_id && !plan.is_confirmed ? (
                    <EditPlanDialog
                      plan={plan}
                      onSuccess={resetLocalTimeblocks}
                    />
                  ) : null}
                </div>
                <p className="mt-2 max-w-3xl text-pretty text-muted-foreground text-sm">
                  {plan.description || t('default_plan_description')}
                </p>
              </div>
              <UtilityButtons plan={plan} handlePNG={downloadAsPNG} />
            </div>
          </header>

          <div id="plan-ref">
            <Tabs defaultValue="availability" className="space-y-5">
              <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl border bg-muted/30 p-1 sm:w-fit sm:min-w-[28rem]">
                <TabsTrigger value="availability" className="gap-2 py-2.5">
                  <CalendarClock className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('availability')}</span>
                  <span className="sm:hidden">{t('times')}</span>
                </TabsTrigger>
                <TabsTrigger value="suggestions" className="gap-2 py-2.5">
                  <Activity className="h-4 w-4" /> {t('suggestions')}
                </TabsTrigger>
                <TabsTrigger value="insights" className="gap-2 py-2.5">
                  <Users className="h-4 w-4" /> {t('insights')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="availability" className="mt-0">
                <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
                  <section className="min-w-0 rounded-2xl border bg-background/80 p-3 sm:p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                      <div>
                        <h2 className="font-semibold">
                          {t('availability_canvas')}
                        </h2>
                        <p className="text-muted-foreground text-xs">
                          {t('availability_canvas_description')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="show-best-times" className="text-xs">
                          {t('peak_only')}
                        </Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <CircleQuestionMark className="h-3.5 w-3.5 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            {t('peak_only_description')}
                          </TooltipContent>
                        </Tooltip>
                        <Switch
                          id="show-best-times"
                          checked={showBestTimes}
                          onCheckedChange={setShowBestTimes}
                          disabled={isUserFilterActive}
                        />
                      </div>
                    </div>
                    <UnifiedAvailability
                      plan={plan}
                      timeblocks={timeblocks}
                      showBestTimes={showBestTimes}
                    />
                  </section>
                  <aside className="rounded-2xl border bg-background/80 p-2 xl:sticky xl:top-4">
                    <SidebarDisplay plan={plan} polls={polls} users={users} />
                  </aside>
                </div>
              </TabsContent>

              <TabsContent value="suggestions" className="mt-0">
                <MeetSuggestionsPanel
                  plan={plan}
                  users={users}
                  timeblocks={timeblocks}
                  finalizedTimeframes={finalizedTimeframes}
                  isCreator={isCreator}
                />
              </TabsContent>

              <TabsContent value="insights" className="mt-0">
                <MeetInsightsPanel
                  plan={plan}
                  users={users}
                  timeblocks={timeblocks}
                />
              </TabsContent>
            </Tabs>
          </div>

          <section className="rounded-2xl border bg-background/80 p-4 sm:p-5">
            <AgendaDetails plan={plan} />
          </section>
        </div>
      </main>
      {isDirty && <StickyBottomIndicator />}
      <PlanLogin plan={plan} baseUrl={baseUrl} />
    </>
  );
}
