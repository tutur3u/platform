'use client';

import { PlanDetailsPollContent } from '../../polls/poll-display';
import PlanUserFilterAccordion from './plan-user-filter-accordion';
import type {
  MeetTogetherPlan,
  PlanUser,
} from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { GetPollsForPlanResult } from '@tuturuuu/types/primitives/Poll';
import type { User } from '@tuturuuu/types/primitives/User';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { useTranslations } from 'next-intl';

export interface SidebarDisplayProps {
  plan: MeetTogetherPlan;
  isCreator: boolean;
  platformUser: User | null;
  polls: GetPollsForPlanResult | null;
  users: PlanUser[];
}

export default function SidebarDisplay({
  plan,
  isCreator,
  platformUser,
  polls,
  users,
}: SidebarDisplayProps) {
  const t = useTranslations('ws-polls');

  return (
    <Accordion
      type="multiple"
      className="order-first col-span-1 w-full md:order-last"
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
            platformUser={platformUser}
            polls={polls}
          />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2" className="w-full">
        <AccordionTrigger className="pl-3 text-lg">Users</AccordionTrigger>
        <AccordionContent>
          <PlanUserFilterAccordion users={users} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
