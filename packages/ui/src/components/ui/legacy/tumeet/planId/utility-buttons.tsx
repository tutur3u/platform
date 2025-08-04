'use client';

import CopyLinkButton, { generateTumeetMeUrl } from './copy-link-button';
import DownloadAsPNG from './download-as-png';
import EmailButton from './email-button';
import LoggedInAsButton from './logged-in-as-button';
import ShowQRButton from './show-qr-button';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { User } from '@tuturuuu/types/primitives/User';
import { Button } from '@tuturuuu/ui/button';
import { Check, Edit } from '@tuturuuu/ui/icons';
import { usePathname, useRouter } from 'next/navigation';
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
  const isCreator = platformUser?.id === plan.creator_id;

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
              isCofirmPlan={Boolean(plan.is_confirm)}
            />
            {/* <EnableUnknownEditButton
              planId={plan.id}
              isEnableUnknownPlan={Boolean(plan.enable_unknown_edit)}
            /> */}
          </>
        )}
      </div>
      <LoggedInAsButton platformUser={platformUser} />
    </div>
  );
}

function ConfirmButton({
  planId,
  isCofirmPlan,
}: {
  planId: string;
  isCofirmPlan: boolean;
}) {
  // const t = useTranslations('meet-together-plan-details');
  const [isConfirmed, setConfirmed] = useState(isCofirmPlan);
  const router = useRouter();
  return (
    <Button
      onClick={async () => {
        const res = await fetch(
          `/api/meet-together/plans/${planId}/edit-lock`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              // enableToEdit: !isConfirmed,
              isConfirm: !isConfirmed,
            }),
          }
        );
        if (!res.ok) {
          console.error('Failed to update plan confirmation status');
          return;
        }
        setConfirmed(!isConfirmed);
        router.refresh();
      }}
      className="w-full md:w-auto"
    >
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
    </Button>
  );
}
// function EnableUnknownEditButton({
//   planId,
//   isEnableUnknownPlan,
// }: {
//   planId: string;
//   isEnableUnknownPlan: boolean;
// }) {
//   // const t = useTranslations('meet-together-plan-details');
//   const [isEnableEdited, setEnableEdited] = useState(isEnableUnknownPlan);

//   return (
//     <Button
//       onClick={async () => {
//         const res = await fetch(
//           `/api/meet-together/plans/${planId}/edit-lock`,
//           {
//             method: 'PATCH',
//             headers: {
//               'Content-Type': 'application/json',
//             },
//             body: JSON.stringify({
//               // enableToEdit: !isEnableEdited,
//               enableUnknownEdit: !isEnableEdited,
//             }),
//           }
//         );
//         if (!res.ok) {
//           console.error('Failed to update plan confirmation status');
//           return;
//         }
//         setEnableEdited(!isEnableEdited);
//       }}
//       className="w-full md:w-auto"
//     >
//       {!isEnableEdited ? (
//         <>
//           <ListCheck className="mr-1 h-5 w-5" />
//           Enable Anonymous to Edit
//         </>
//       ) : (
//         <>
//           <PenOff className="mr-1 h-5 w-5" />
//           Disable Anonymous to Edit
//         </>
//       )}
//     </Button>
//   );
// }
