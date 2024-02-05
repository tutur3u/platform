'use client';

import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';
import CopyLinkButton from './copy-link-button';
import EmailButton from './email-button';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import LoggedInAsButton from './logged-in-as-button';

export default function UtilityButtons({ plan }: { plan: MeetTogetherPlan }) {
  const pathname = usePathname();
  const [url, setUrl] = useState('');

  useEffect(() => {
    setUrl(`${window.location.origin}${pathname}`);
  }, [pathname]);

  if (!plan?.id) return null;

  return (
    <div className="flex w-full flex-col items-center justify-between gap-4 md:flex-row md:items-start">
      <div className="flex flex-wrap items-start gap-2">
        <CopyLinkButton url={url} />
        <EmailButton plan={plan} url={url} />
      </div>
      <LoggedInAsButton />
    </div>
  );
}
