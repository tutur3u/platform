'use client';

import CopyLinkButton, { generateTumeetMeUrl } from './copy-link-button';
import DownloadAsPNG from './download-as-png';
import EmailButton from './email-button';
import LoggedInAsButton from './logged-in-as-button';
import ShowQRButton from './show-qr-button';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { User } from '@tuturuuu/types/primitives/User';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface UtilityButtonsProps {
  plan: MeetTogetherPlan;
  platformUser: User | null;
  handlePNG: () => Promise<void>;
}

export default function UtilityButtons({
  plan,
  platformUser,
  handlePNG,
}: UtilityButtonsProps) {
  const pathname = usePathname();
  const [url, setUrl] = useState('');

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
      </div>
      <LoggedInAsButton platformUser={platformUser} />
    </div>
  );
}
