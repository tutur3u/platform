'use client';

import {
  Check,
  Clock3,
  FileText,
  FlaskConical,
  Gauge,
  Info,
  Minus,
  Server,
  Users,
} from '@tuturuuu/icons/lucide';
import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

const statusIcons = {
  info: Info,
  included: Check,
  excluded: Minus,
  preview: FlaskConical,
  contract: FileText,
  seats: Users,
  internal: Server,
  pending: Clock3,
  limited: Gauge,
};

/** Keep quantities visible; status wording and scope stay accessible on focus or tap. */
export function ComparisonValue({
  value,
  label,
  context,
  explanation,
}: {
  value: string;
  label: string;
  context: string;
  explanation?: string;
}) {
  const [open, setOpen] = useState(false);
  const Icon = statusIcons[value as keyof typeof statusIcons];
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${context}: ${label}`}
          className={`inline-flex min-h-8 min-w-8 items-center justify-center rounded-md px-1.5 align-middle transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring ${value === 'excluded' ? 'text-muted-foreground' : value === 'included' ? 'text-dynamic-green' : 'font-medium text-foreground'}`}
          onClick={(event) => {
            event.preventDefault();
            setOpen(!open);
          }}
        >
          {Icon ? (
            <Icon
              aria-hidden="true"
              className="size-4"
              strokeWidth={value === 'included' ? 2.5 : 1.75}
            />
          ) : (
            label
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 space-y-1 text-left">
        <p className="font-semibold">{label}</p>
        {explanation && <p className="leading-relaxed">{explanation}</p>}
      </TooltipContent>
    </Tooltip>
  );
}
