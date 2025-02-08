'use client';

import CopyLinkButton from './copy-link-button';
import EmailButton from './email-button';
import LoggedInAsButton from './logged-in-as-button';
import ShowQRButton from './show-qr-button';
import { MeetTogetherPlan } from '@repo/types/primitives/MeetTogetherPlan';
import { User } from '@repo/types/primitives/User';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function UtilityButtons({
  plan,
  platformUser,
}: {
  plan: MeetTogetherPlan;
  platformUser: User | null;
}) {
  const pathname = usePathname();
  const [url, setUrl] = useState('');

  useEffect(() => {
    setUrl(`${window.location.origin}${pathname}`);
  }, [pathname]);

  if (!plan?.id) return null;

  return (
    <div className="flex w-full flex-col items-center justify-between gap-4 md:flex-row md:items-start">
      <div className="flex w-full flex-wrap items-start gap-2">
        <CopyLinkButton url={url} />
        <ShowQRButton url={url} />
        <EmailButton plan={plan} url={url} />
      </div>
      <LoggedInAsButton platformUser={platformUser} />
    </div>
  );
}
