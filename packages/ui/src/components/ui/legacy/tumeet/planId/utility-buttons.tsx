'use client';

import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import CopyLinkButton, { generateTumeetMeUrl } from './copy-link-button';
import DownloadAsPNG from './download-as-png';
import EmailButton from './email-button';
import LoggedInAsButton from './logged-in-as-button';
import ShowQRButton from './show-qr-button';

interface UtilityButtonsProps {
  plan: MeetTogetherPlan;
  handlePNG: () => Promise<void>;
}

export default function UtilityButtons({
  plan,
  handlePNG,
}: UtilityButtonsProps) {
  const pathname = usePathname();
  const [url, setUrl] = useState('');

  // const { user } = useTimeBlocking();
  // const isCreator = !user?.is_guest && user?.id === plan.creator_id;

  useEffect(() => {
    setUrl(`${window.location.origin}${pathname}`);
  }, [pathname]);

  const tumeetMeUrl = generateTumeetMeUrl(url);

  if (!plan?.id) return null;

  return (
    <div className="flex w-full flex-col items-center justify-between gap-4 md:flex-row md:items-start">
      <div className="flex w-full flex-wrap items-start gap-2">
        <CopyLinkButton url={url} />
        <ShowQRButton url={url} />
        <EmailButton plan={plan} url={tumeetMeUrl} />
        <DownloadAsPNG onClick={handlePNG} />
        {/* {isCreator && (
          <>
            <ConfirmButton
              planId={plan.id}
              isConfirmPlan={Boolean(plan.is_confirmed)}
            />
          </>
        )} */}
      </div>
      <LoggedInAsButton />
    </div>
  );
}
