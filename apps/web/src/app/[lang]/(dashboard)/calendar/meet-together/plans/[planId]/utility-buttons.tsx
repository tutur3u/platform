'use client';

import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';
import CopyLinkButton from './copy-link-button';
import EmailButton from './email-button';
import { usePathname } from 'next/navigation';

export default function UtilityButtons({ plan }: { plan: MeetTogetherPlan }) {
  const pathname = usePathname();
  const currentUrl = `${window.location.origin}${pathname}`;

  if (!plan?.id) return null;

  return (
    <>
      <CopyLinkButton url={currentUrl} />
      <EmailButton plan={plan} url={currentUrl} />
    </>
  );
}
