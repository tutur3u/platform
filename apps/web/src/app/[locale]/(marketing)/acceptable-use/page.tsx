import { Shield } from '@tuturuuu/icons';
import { LegalPageLayout } from '@/components/legal/legal-page-layout';
import type { LegalPageConfig } from '@/components/legal/legal-types';
import { acceptableUseSections } from '@/data/legal/acceptable-use-sections';
import { acceptableUseSummaryRows } from '@/data/legal/acceptable-use-summary';

const config: LegalPageConfig = {
  badgeText: 'Legal Documentation',
  badgeIcon: Shield,
  title: 'Acceptable Use',
  highlightedWord: 'Policy',
  effectiveDate: '2026-02-06',
  summaryTitle: 'Key Policy Points',
  summaryDescription:
    'This summary provides a quick overview but does not replace the full Acceptable Use Policy below.',
  summaryRows: acceptableUseSummaryRows,
  sections: acceptableUseSections,
  footerText:
    'This Acceptable Use Policy ensures a safe and fair platform for all users. For questions, contact our legal department at legal@tuturuuu.com.',
};

export default function AcceptableUsePage() {
  return <LegalPageLayout config={config} />;
}
