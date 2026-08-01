'use client';

import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import CopyLinkButton, { generateCanonicalMeetUrl } from './copy-link-button';
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
  if (!plan?.id) return null;
  const url = generateCanonicalMeetUrl(plan.id);

  return (
    <div className="flex w-full flex-col items-center justify-between gap-4 md:flex-row md:items-start">
      <div className="flex w-full flex-wrap items-start gap-2">
        <CopyLinkButton url={url} />
        <ShowQRButton url={url} />
        <EmailButton plan={plan} url={url} />
        <DownloadAsPNG onClick={handlePNG} />
      </div>
      <LoggedInAsButton />
    </div>
  );
}
