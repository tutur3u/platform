import type { ReactNode } from 'react';
import type { SummaryRow } from '../../components/legal/legal-types';

const badgeClassNames = {
  conditional:
    'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
  never:
    'border-transparent bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/20',
  optional: 'border-border bg-transparent text-foreground',
  required:
    'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
} as const;

function SummaryBadge({
  children,
  variant,
}: {
  children: ReactNode;
  variant: keyof typeof badgeClassNames;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold text-xs transition-colors ${badgeClassNames[variant]}`}
    >
      {children}
    </span>
  );
}

export const privacySummaryRows: SummaryRow[] = [
  {
    topic: 'Email Address',
    summary: (
      <span className="flex items-center gap-2">
        <SummaryBadge variant="required">Required</SummaryBadge>
        Mandatory for authentication
      </span>
    ),
  },
  {
    topic: 'Personal Details',
    summary: (
      <span className="flex items-center gap-2">
        <SummaryBadge variant="optional">Optional</SummaryBadge>
        Name, gender, birthday
      </span>
    ),
  },
  {
    topic: 'Payment Info',
    summary: (
      <span className="flex items-center gap-2">
        <SummaryBadge variant="conditional">Conditional</SummaryBadge>
        Only for paid plans via Polar.sh
      </span>
    ),
  },
  {
    topic: 'Data Selling',
    summary: (
      <span className="flex items-center gap-2">
        <SummaryBadge variant="never">Never</SummaryBadge>
        We do NOT sell your data
      </span>
    ),
  },
];
