'use client';

import AgendaDetails from './agenda-details';
import PlanUserFilter from './plan-user-filter';
import { useTimeBlocking } from './time-blocking-provider';
import UnifiedAvailability from './unified-availability';
import UtilityButtons from './utility-buttons';
import PlanDetailsPolls from '@/app/[locale]/(marketing)/meet-together/plans/[planId]/plan-details-polls';
import type {
  GetPollsForPlanResult,
  MeetTogetherPlan,
} from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { User } from '@tuturuuu/types/primitives/User';
import { CircleQuestionMark } from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import EditPlanDialog from '@tuturuuu/ui/legacy/tumeet/edit-plan-dialog';
import { Separator } from '@tuturuuu/ui/separator';
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import html2canvas from 'html2canvas-pro';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useState } from 'react';

interface PlanDetailsClientProps {
  plan: MeetTogetherPlan;
  polls: GetPollsForPlanResult | null;
  platformUser: User | null;
  isCreator: boolean;
  users: {
    id: string | null;
    display_name: string | null;
    is_guest: boolean | null;
    timeblock_count: number | null;
  }[];
  timeblocks: {
    is_guest: boolean;
    created_at: string;
    date: string;
    end_time: string;
    id: string;
    plan_id: string;
    start_time: string;
    user_id: string;
  }[];
}

export default function PlanDetailsClient({
  plan,
  platformUser,
  isCreator,
  users,
  polls,
  timeblocks,
}: PlanDetailsClientProps) {
  const { resolvedTheme } = useTheme();
  const [showBestTimes, setShowBestTimes] = useState(false);
  const { filteredUserIds, isDirty, resetLocalTimeblocks } = useTimeBlocking();

  // If user filter is active, force best times off
  const isUserFilterActive = filteredUserIds && filteredUserIds.length > 0;

  useEffect(() => {
    if (isUserFilterActive && showBestTimes) {
      setShowBestTimes(false);
    }
  }, [isUserFilterActive, showBestTimes]);

  // Best times status state
  const [bestTimesStatusByDate, setBestTimesStatusByDate] = useState<
    Record<string, boolean>
  >({});
  const allDates = plan.dates || [];
  const noBestTimesFound =
    showBestTimes &&
    allDates.length > 0 &&
    allDates.every((d) => bestTimesStatusByDate[d] === false);

  const downloadAsPNG = useCallback(async () => {
    const element = document.getElementById('plan-ref');
    if (!element) throw new Error('Plan element not found');

    const backgroundColor = resolvedTheme === 'dark' ? '#0a0a0a' : '#ffffff';

    try {
      const canvas = await html2canvas(element, {
        useCORS: true,
        allowTaint: true,
        backgroundColor,
        scale: 1,
        logging: false,
        onclone: (clonedDoc: Document) => {
          Array.from(clonedDoc.getElementsByTagName('link')).forEach(
            (link: HTMLLinkElement) => {
              link.removeAttribute('integrity');
              link.removeAttribute('crossorigin');
            }
          );
        },
      });

      const link = document.createElement('a');
      link.download = `plan-${plan.id}.png`;
      link.href = canvas.toDataURL('image/png', 2.0);
      link.click();
    } catch (error) {
      console.error('Error generating PNG:', error);
      throw error;
    }
  }, [plan.id, resolvedTheme]);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6 p-4 text-foreground md:px-6 lg:gap-14 lg:px-14">
      <div className="flex w-full flex-col items-center">
        <UtilityButtons
          plan={plan}
          platformUser={platformUser}
          handlePNG={downloadAsPNG}
        />

        <div id="plan-ref" className="flex w-full flex-col items-center">
          <p className="my-4 flex max-w-xl items-center gap-2 text-center text-2xl leading-tight! font-semibold text-balance md:mb-4 lg:text-3xl">
            {plan.name}{' '}
            {platformUser?.id === plan.creator_id ? (
              <EditPlanDialog
                plan={plan}
                onSuccess={() => {
                  resetLocalTimeblocks();
                }}
              />
            ) : null}
          </p>

          {/* Global dirty state indicator */}
          {isDirty && (
            <div className="mb-4 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500"></div>
              You have unsaved changes
            </div>
          )}

          {/* Show Only Best Times Toggle - Back to original centered position */}
          <div className="mb-4 flex flex-col items-center justify-center gap-2">
            <div className="flex items-center justify-center gap-2">
              <Label
                htmlFor="show-best-times-toggle"
                className="flex cursor-pointer items-center gap-1 text-sm"
              >
                Show Only Best Times
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="ml-1 inline-flex cursor-pointer items-center justify-center">
                    <CircleQuestionMark size={16} />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div>
                    <div>
                      <b>Show Only Best Times</b> highlights the time slots that
                      work best for the most people.
                    </div>
                    <ul className="mt-2 list-disc pl-4 text-xs">
                      <li>
                        Only time slots where <b>2 or more people</b> are
                        available are highlighted.
                      </li>
                      <li>
                        If you filter by user, this feature is <b>disabled</b>{' '}
                        (since &quot;best time&quot; only makes sense for
                        groups).
                      </li>
                    </ul>
                    <div className="mt-2 text-xs text-muted-foreground">
                      We&apos;re always tweaking this feature for clarity and
                      usefulness. Let us know if you have feedback!
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
              <Switch
                id="show-best-times-toggle"
                checked={showBestTimes}
                onCheckedChange={() => setShowBestTimes((v) => !v)}
                disabled={isUserFilterActive}
              />
            </div>
            {noBestTimesFound && (
              <div className="mt-2 w-full max-w-xl rounded bg-yellow-100 p-2 text-center text-xs text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100">
                <strong>No best times were found!</strong>
                <br />
                Encourage your group to sync up or adjust their availability.
              </div>
            )}
          </div>
          <div
            className={cn(
              'mt-8 grid w-full grid-cols-1 items-start justify-between gap-4 md:grid-cols-3 md:items-center'
            )}
          >
            <div
              className={cn(
                'md:col-span-2',
                !plan.where_to_meet && 'md:col-span-full'
              )}
            >
              <UnifiedAvailability
                plan={plan}
                timeblocks={timeblocks}
                platformUser={platformUser}
                showBestTimes={showBestTimes}
                onBestTimesStatusByDateAction={setBestTimesStatusByDate}
              />
            </div>
            <PlanDetailsPolls
              plan={plan}
              polls={polls}
              isCreator={isCreator}
              platformUser={platformUser}
            />
          </div>

          <Separator className="my-8" />

          <AgendaDetails plan={plan} platformUser={platformUser} />
        </div>
      </div>
      {users.length > 0 && (
        <>
          <Separator className="mt-8" />
          <PlanUserFilter users={users} />
        </>
      )}
    </div>
  );
}
