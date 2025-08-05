'use client';

import CopyLinkButton, { generateTumeetMeUrl } from './copy-link-button';
import DownloadAsPNG from './download-as-png';
import EmailButton from './email-button';
import LoggedInAsButton from './logged-in-as-button';
import ShowQRButton from './show-qr-button';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { Button } from '@tuturuuu/ui/button';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { Check, Edit, Loader2 } from '@tuturuuu/ui/icons';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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

  const { user } = useTimeBlocking();
  const isCreator = !user?.is_guest && user?.id === plan.creator_id;

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
        {isCreator && (
          <>
            <ConfirmButton
              planId={plan.id}
              isConfirmPlan={Boolean(plan.is_confirmed)}
            />
          </>
        )}
      </div>
      <LoggedInAsButton />
    </div>
  );
}

function ConfirmButton({
  planId,
  isConfirmPlan,
}: {
  planId: string;
  isConfirmPlan: boolean;
}) {
  const [isConfirmed, setConfirmed] = useState(isConfirmPlan);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  return (
    <Button
      onClick={async () => {
        if (isLoading) return;
        setIsLoading(true);
        const res = await fetch(
          `/api/meet-together/plans/${planId}/edit-lock`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              isConfirm: !isConfirmed,
            }),
          }
        );
        if (!res.ok) {
          console.error('Failed to update plan confirmation status');
          return;
        }
        setConfirmed(!isConfirmed);
        setIsLoading(false);
        router.refresh();
      }}
      className="w-full md:w-auto"
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-1 h-5 w-5 animate-spin" />
          Updating...
        </>
      ) : (
        <>
          {!isConfirmed ? (
            <>
              <Check className="mr-1 h-5 w-5" />
              Confirm
            </>
          ) : (
            <>
              <Edit className="mr-1 h-5 w-5" />
              Re-Edit
            </>
          )}
        </>
      )}
    </Button>
  );
}
