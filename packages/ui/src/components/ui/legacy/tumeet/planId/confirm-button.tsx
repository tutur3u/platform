import { Button } from '@tuturuuu/ui/button';
import { Check, Edit, Loader2 } from '@tuturuuu/ui/icons';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ConfirmButton({
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
