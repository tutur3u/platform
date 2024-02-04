'use client';

import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';
import CopyLinkButton from './copy-link-button';
import EmailButton from './email-button';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function UtilityButtons({ plan }: { plan: MeetTogetherPlan }) {
  const pathname = usePathname();
  const [url, setUrl] = useState('');

  useEffect(() => {
    setUrl(`${window.location.origin}${pathname}`);
  }, [pathname]);

  if (!plan?.id) return null;

  return (
    <>
      <CopyLinkButton url={url} />
      <EmailButton plan={plan} url={url} />
    </>
  );
}
