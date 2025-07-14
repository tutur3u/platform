'use client';

import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { Button } from '@tuturuuu/ui/button';
import { Pencil } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';

interface Props {
  plan: MeetTogetherPlan;
}

export default function EditPlanDialog({ plan }: Props) {
  const t = useTranslations('meet-together-plan-details');

  // Simplified version - full implementation would include edit functionality
  return (
    <Button variant="ghost" size="icon" disabled>
      <Pencil size={24} />
    </Button>
  );
}
