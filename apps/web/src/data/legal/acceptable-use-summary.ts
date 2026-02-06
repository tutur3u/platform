import type { SummaryRow } from '@/components/legal/legal-types';

export const acceptableUseSummaryRows: SummaryRow[] = [
  {
    topic: 'Scope',
    summary: 'Applies to all users, API consumers, and contributors',
  },
  {
    topic: 'Permitted',
    summary: 'Productivity, collaboration, and legitimate business use',
  },
  {
    topic: 'Prohibited',
    summary: 'Illegal activities, abuse, malware, and deceptive practices',
  },
  {
    topic: 'API Limits',
    summary: 'Default 100 requests/minute — contact us for higher limits',
  },
  {
    topic: 'Enforcement',
    summary: 'Notice → Feature restriction → Suspension → Termination',
  },
];
