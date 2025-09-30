'use client';

import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import type { ReactNode } from 'react';

interface LeadGenerationEmailPreviewProps {
  configs: WorkspaceConfig[];
  leadData?: {
    leadName?: string;
    className?: string;
    teacherName?: string;
    avgScore?: number;
    comments?: string;
    currentDate?: string;
  };
}

export default function LeadGenerationEmailPreview({
  configs,
  leadData = {},
}: LeadGenerationEmailPreviewProps) {
  const getConfig = (id: string) => configs.find((c) => c.id === id)?.value;

  // Parse dynamic text with variable replacements
  const parseDynamicText = (text?: string | null): ReactNode => {
    if (!text) return '';

    return text
      .replace(/{{leadName}}/g, leadData.leadName || '')
      .replace(/{{className}}/g, leadData.className || '')
      .replace(/{{teacherName}}/g, leadData.teacherName || '')
      .replace(
        /{{currentDate}}/g,
        leadData.currentDate || new Date().toLocaleDateString()
      )
      .replace(/{{avgScore}}/g, leadData.avgScore?.toString() || '');
  };

  // Required config keys (reusing existing report configs where possible)
  const brandLogoUrl = getConfig('BRAND_LOGO_URL');
  const brandName = getConfig('BRAND_NAME');
  const brandLocation = getConfig('BRAND_LOCATION');
  const brandPhone = getConfig('BRAND_PHONE_NUMBER');
  const emailTitle = getConfig('LEAD_EMAIL_TITLE');
  const emailGreeting = getConfig('LEAD_EMAIL_GREETING');
  const tableHeaderComments = getConfig('LEAD_EMAIL_TABLE_HEADER_COMMENTS');
  const tableHeaderScore = getConfig('LEAD_EMAIL_TABLE_HEADER_SCORE');
  const emailFooter = getConfig('LEAD_EMAIL_FOOTER');
  const signatureTitle = getConfig('LEAD_EMAIL_SIGNATURE_TITLE');
  const signatureName = getConfig('LEAD_EMAIL_SIGNATURE_NAME');

  // Optional config keys
  const tableScoreScale = getConfig('LEAD_EMAIL_TABLE_SCORE_SCALE');
  const brandLogoWidth = getConfig('LEAD_EMAIL_BRAND_LOGO_WIDTH') || '100';
  const brandLogoHeight = getConfig('LEAD_EMAIL_BRAND_LOGO_HEIGHT') || '38';
  const titleColor = getConfig('LEAD_EMAIL_TITLE_COLOR') || 'blue-700';
  const emptyCommentsPlaceholder =
    getConfig('LEAD_EMAIL_EMPTY_COMMENTS') ||
    '...........................................................';
  const emptyScorePlaceholder = getConfig('LEAD_EMAIL_EMPTY_SCORE') || '...';

  // Check if required configs are missing
  const missingConfigs = [];
  if (!brandLogoUrl) missingConfigs.push('BRAND_LOGO_URL');
  if (!brandName) missingConfigs.push('BRAND_NAME');
  if (!brandPhone) missingConfigs.push('BRAND_PHONE_NUMBER');
  if (!emailTitle) missingConfigs.push('LEAD_EMAIL_TITLE');
  if (!emailGreeting) missingConfigs.push('LEAD_EMAIL_GREETING');
  if (!tableHeaderComments)
    missingConfigs.push('LEAD_EMAIL_TABLE_HEADER_COMMENTS');
  if (!tableHeaderScore) missingConfigs.push('LEAD_EMAIL_TABLE_HEADER_SCORE');
  if (!emailFooter) missingConfigs.push('LEAD_EMAIL_FOOTER');
  if (!signatureTitle) missingConfigs.push('LEAD_EMAIL_SIGNATURE_TITLE');
  if (!signatureName) missingConfigs.push('LEAD_EMAIL_SIGNATURE_NAME');

  if (missingConfigs.length > 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            Missing Required Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm">
            The following workspace configuration variables are required:
          </p>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {missingConfigs.map((config) => (
              <li key={config}>
                <code className="rounded bg-muted px-1 py-0.5">{config}</code>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Lead Generation Email Preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            <div className="m-4 rounded-lg border bg-white p-6 font-sans text-[14px] text-black leading-6">
              {/* Header */}
              <div className="text-center">
                <img
                  src={brandLogoUrl || ''}
                  width={brandLogoWidth}
                  height={brandLogoHeight}
                  alt={`${brandName} Logo`}
                  className="mx-auto"
                />
                <div className="mt-2 font-bold text-lg">{brandName}</div>
                {brandLocation && (
                  <div
                    className="text-sm"
                    dangerouslySetInnerHTML={{
                      __html: brandLocation.replace(/\n/g, '<br />'),
                    }}
                  />
                )}
                <div className="mt-1 text-sm">{brandPhone}</div>
              </div>

              {/* Title */}
              <div
                className={`mt-4 text-center font-bold text-${titleColor} text-lg uppercase`}
              >
                {emailTitle}
              </div>

              {/* Greeting */}
              <p className="mt-4 whitespace-pre-line">
                {parseDynamicText(emailGreeting)}
              </p>

              {/* Comments + Score Table */}
              <table className="mt-4 w-full border-collapse border border-black text-sm">
                <thead>
                  <tr>
                    <th className="w-[70%] border border-black p-2 text-center">
                      {tableHeaderComments}
                    </th>
                    <th className="w-[30%] border border-black p-2 text-center">
                      {tableHeaderScore}
                      {tableScoreScale && (
                        <>
                          {' '}
                          <br /> {tableScoreScale}
                        </>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="whitespace-pre-line border border-black p-4 align-top">
                      {leadData.comments || emptyCommentsPlaceholder}
                    </td>
                    <td className="border border-black p-4 text-center align-top">
                      {leadData.avgScore !== undefined
                        ? leadData.avgScore
                        : emptyScorePlaceholder}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Footer Note */}
              <p className="mt-4 text-sm whitespace-pre-line">
                {parseDynamicText(emailFooter)}
              </p>

              {/* Signature */}
              <div className="mt-6 text-right font-semibold">
                {signatureTitle}
                <br />
                {signatureName}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
