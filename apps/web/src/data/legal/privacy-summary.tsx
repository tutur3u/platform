import { Badge } from '@tuturuuu/ui/badge';
import type { SummaryRow } from '@/components/legal/legal-types';

export const privacySummaryRows: SummaryRow[] = [
  {
    topic: 'Email Address',
    summary: (
      <span className="flex items-center gap-2">
        <Badge variant="destructive">Required</Badge>
        Mandatory for authentication
      </span>
    ),
  },
  {
    topic: 'Personal Details',
    summary: (
      <span className="flex items-center gap-2">
        <Badge variant="outline">Optional</Badge>
        Name, gender, birthday
      </span>
    ),
  },
  {
    topic: 'Payment Info',
    summary: (
      <span className="flex items-center gap-2">
        <Badge variant="secondary">Conditional</Badge>
        Only for paid plans via Polar.sh
      </span>
    ),
  },
  {
    topic: 'Data Selling',
    summary: (
      <span className="flex items-center gap-2">
        <Badge className="bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/20">
          Never
        </Badge>
        We do NOT sell your data
      </span>
    ),
  },
];
