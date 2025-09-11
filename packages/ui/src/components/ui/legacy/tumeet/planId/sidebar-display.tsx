'use client';

import type {
  MeetTogetherPlan,
  PlanUser,
} from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { GetPollsForPlanResult } from '@tuturuuu/types/primitives/Poll';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { useTranslations } from 'next-intl';
import { PlanDetailsPollContent } from '../../polls/poll-display';
import PlanUserFilterAccordion from './plan-user-filter-accordion';

export interface SidebarDisplayProps {
  plan: MeetTogetherPlan;
  polls: GetPollsForPlanResult | null;
  users: PlanUser[];
}

export default function SidebarDisplay({
  plan,
  polls,
  users,
}: SidebarDisplayProps) {
  const t = useTranslations('ws-polls');
  const { user, originalPlatformUser } = useTimeBlocking();

  // Determine if the current user is the creator
  const isCreator = user?.id === plan.creator_id;

  return (
    <Accordion
      type="multiple"
      className="col-span-1 w-full"
      defaultValue={['item-1']}
    >
      <AccordionItem value="item-1" className="w-full">
        <AccordionTrigger className="pl-3 text-lg">
          {t('plural')}
        </AccordionTrigger>
        <AccordionContent>
          <PlanDetailsPollContent
            plan={plan}
            isCreator={isCreator}
            platformUser={originalPlatformUser}
            polls={polls}
          />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2" className="w-full">
        <AccordionTrigger className="pl-3 text-lg">Users</AccordionTrigger>
        <AccordionContent>
          <PlanUserFilterAccordion
            users={users}
            isCreator={isCreator}
            platformUser={originalPlatformUser}
            planId={plan.id}
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
