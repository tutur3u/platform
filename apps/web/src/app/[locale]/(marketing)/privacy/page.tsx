import { Shield } from '@tuturuuu/icons';
import { Card } from '@tuturuuu/ui/card';
import { LegalPageLayout } from '@/components/legal/legal-page-layout';
import type { LegalPageConfig } from '@/components/legal/legal-types';
import { privacySections } from '@/data/legal/privacy-sections';
import { privacySummaryRows } from '@/data/legal/privacy-summary';

const config: LegalPageConfig = {
  badgeText: 'Privacy & Data',
  badgeIcon: Shield,
  title: 'Privacy',
  highlightedWord: 'Policy',
  effectiveDate: '2026-02-06',
  summaryTitle: 'Key Privacy Principles',
  summaryDescription:
    'This summary highlights important aspects of our privacy practices but does not replace the complete policy.',
  summaryRows: privacySummaryRows,
  sections: privacySections,
  footerText:
    'This Privacy Policy outlines our commitment to protecting your personal information. For questions or concerns, please contact our Data Protection team at privacy@tuturuuu.com.',
  extraContent: (
    <Card className="border-primary/20 p-6">
      <h3 className="mb-3 flex items-center font-semibold text-md">
        <Shield className="mr-2 h-4 w-4 text-primary" />
        GDPR & International Compliance
      </h3>
      <p className="text-muted-foreground text-sm">
        Tuturuuu JSC is committed to compliance with international data
        protection regulations, including GDPR, CCPA, and other applicable laws.
        We process personal data lawfully, fairly, and transparently. For EU/UK
        users, we serve as a data controller for account information and a
        processor for content you create. As an open-source platform, our data
        handling practices are publicly auditable.
      </p>
    </Card>
  ),
};

export default function PrivacyPage() {
  return <LegalPageLayout config={config} />;
}
