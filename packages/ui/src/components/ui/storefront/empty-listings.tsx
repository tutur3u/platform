import { PackageOpen } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import type { StorefrontSurfaceLabels } from './types';

export function StorefrontEmptyListings({
  action,
  labels,
  radius,
}: {
  action?: ReactNode;
  labels: StorefrontSurfaceLabels;
  radius: string;
}) {
  return (
    <div
      className={cn(
        'grid min-h-56 place-items-center border border-dashed bg-muted/25 p-6 text-center sm:col-span-2 xl:col-span-3',
        radius
      )}
    >
      <div className="max-w-sm">
        <PackageOpen className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-semibold">{labels.emptyListingsTitle}</p>
        <p className="mt-1 text-muted-foreground text-sm leading-6">
          {labels.emptyListingsDescription}
        </p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
