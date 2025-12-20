'use client';

import { CircleQuestionMark } from '@tuturuuu/icons';
import type {
  MeetTogetherPlan,
  PlanUser,
} from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { GetPollsForPlanResult } from '@tuturuuu/types/primitives/Poll';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { Label } from '@tuturuuu/ui/label';
import EditPlanDialog from '@tuturuuu/ui/legacy/tumeet/edit-plan-dialog';
import { Separator } from '@tuturuuu/ui/separator';
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useState } from 'react';
import AgendaDetails from './agenda-details';
import PlanLogin from './plan-login';
import SidebarDisplay from './sidebar-display';
import StickyBottomIndicator from './sticky-bottom-indicator';
import UnifiedAvailability from './unified-availability';
import UtilityButtons from './utility-buttons';

interface PlanDetailsClientProps {
  plan: MeetTogetherPlan;
  polls: GetPollsForPlanResult | null;
  // platformUser: User | null;
  // isCreator: boolean;
  users: PlanUser[];
  timeblocks: Timeblock[];
  baseUrl: string;
}

export default function PlanDetailsClient({
  plan,
  // platformUser,
  // isCreator,
  users,
  polls,
  timeblocks,
  baseUrl,
}: PlanDetailsClientProps) {
  const { resolvedTheme } = useTheme();
  const [showBestTimes, setShowBestTimes] = useState(false);
  const { filteredUserIds, isDirty, resetLocalTimeblocks, user } =
    useTimeBlocking();

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
      const html2canvas = (await import('html2canvas-pro')).default;
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
    <>
      <div className="flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:px-6 lg:gap-14 lg:px-10">
        <div className="flex w-full flex-col items-center">
          <UtilityButtons plan={plan} handlePNG={downloadAsPNG} />

          <div id="plan-ref" className="flex w-full flex-col items-center">
            <p className="my-4 flex max-w-xl items-center gap-2 text-balance text-center font-semibold text-2xl leading-tight! md:mb-4 lg:text-3xl">
              {plan.name}{' '}
              {user?.id === plan.creator_id ? (
                <EditPlanDialog
                  plan={plan}
                  onSuccess={() => {
                    resetLocalTimeblocks();
                  }}
                />
              ) : null}
            </p>

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
                        <b>Show Only Best Times</b> highlights the time slots
                        that work best for the most people.
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
                      <div className="mt-2 text-muted-foreground text-xs">
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
                'mt-8 grid w-full grid-cols-1 items-start justify-between gap-4 md:grid-cols-3'
              )}
            >
              <div className={cn('md:col-span-2')}>
                <UnifiedAvailability
                  plan={plan}
                  timeblocks={timeblocks}
                  showBestTimes={showBestTimes}
                  onBestTimesStatusByDateAction={setBestTimesStatusByDate}
                />
              </div>
              <SidebarDisplay plan={plan} polls={polls} users={users} />
            </div>

            <Separator className="my-8" />

            <AgendaDetails plan={plan} />
          </div>
        </div>
      </div>

      {/* Discord-style sticky bottom indicator for unsaved changes */}
      {isDirty && <StickyBottomIndicator />}

      <PlanLogin plan={plan} baseUrl={baseUrl} />
    </>
  );
}
