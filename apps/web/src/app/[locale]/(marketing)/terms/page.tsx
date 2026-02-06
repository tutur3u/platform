import { FileText } from '@tuturuuu/icons';
import { LegalPageLayout } from '@/components/legal/legal-page-layout';
import type { LegalPageConfig } from '@/components/legal/legal-types';
import { termsSections } from '@/data/legal/terms-sections';
import { termsSummaryRows } from '@/data/legal/terms-summary';

const config: LegalPageConfig = {
  badgeText: 'Legal Documentation',
  badgeIcon: FileText,
  title: 'Terms of',
  highlightedWord: 'Service',
  effectiveDate: '2026-02-06',
  summaryTitle: 'Key Points Summary',
  summaryDescription:
    'This summary provides a quick overview of the key terms but does not replace the full agreement below.',
  summaryRows: termsSummaryRows,
  sections: termsSections,
  footerText:
    'These Terms of Service constitute a legally binding agreement between you and Tuturuuu JSC. If you have any questions, please contact our legal department at legal@tuturuuu.com.',
};

export default function TermsPage() {
  return <LegalPageLayout config={config} />;
}
