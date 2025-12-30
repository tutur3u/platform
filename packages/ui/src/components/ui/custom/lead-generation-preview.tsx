'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { Separator } from '../separator';

interface LeadGenerationPreviewProps {
  t?: any;
  parseDynamicText?: (text?: string | null) => ReactNode;
  getConfig?: (id: string) => string | null | undefined;
  theme?: 'light' | 'dark';
  // Alternative props for direct data passing (follow-up page use case)
  configs?: Array<{ id: string; value?: string | null }>;
  leadData?: {
    leadName?: string;
    className?: string;
    teacherName?: string;
    avgScore?: number;
    comments?: string;
    currentDate?: string;
    minimumAttendance?: number;
  };
  // UI options
  showCard?: boolean;
  showMissingConfigWarning?: boolean;
  maxHeight?: string;
}

export default function LeadGenerationPreview({
  t: _t,
  parseDynamicText: externalParseDynamicText,
  getConfig: externalGetConfig,
  theme = 'light',
  configs,
  leadData,
  showCard = false,
  showMissingConfigWarning = false,

  maxHeight: _maxHeight,
}: LeadGenerationPreviewProps) {
  // Create getConfig function based on provided props
  const getConfig = (id: string): string | null | undefined => {
    if (externalGetConfig) return externalGetConfig(id);
    if (configs) return configs.find((c) => c.id === id)?.value;
    return undefined;
  };

  // Create parseDynamicText function
  const parseDynamicText = (text?: string | null): ReactNode => {
    if (!text) return '';

    // If external parser provided, use it
    if (externalParseDynamicText) {
      return externalParseDynamicText(text);
    }

    // Otherwise, parse based on leadData
    if (leadData) {
      return text
        .replace(/{{leadName}}/g, leadData.leadName || '')
        .replace(/{{className}}/g, leadData.className || '')
        .replace(/{{teacherName}}/g, leadData.teacherName || '')
        .replace(
          /{{currentDate}}/g,
          leadData.currentDate || new Date().toLocaleDateString()
        )
        .replace(/{{avgScore}}/g, leadData.avgScore?.toString() || '')
        .replace(
          /{{minimumAttendance}}/g,
          leadData.minimumAttendance?.toString() || ''
        );
    }

    // Split the text into segments of dynamic keys and plain text for display
    const segments = text.split(/({{.*?}})/g).filter(Boolean);
    return segments.map((segment, index) => {
      const match = segment.match(/{{(.*?)}}/);
      if (match) {
        const key = match?.[1]?.trim() || '';
        return (
          <span
            key={key + index}
            className="rounded bg-foreground px-1 py-0.5 font-semibold text-background"
          >
            {key}
          </span>
        );
      }
      return segment;
    });
  };

  // Sample/default data for preview
  const sampleData = leadData || {
    leadName: '{{leadName}}',
    className: '{{className}}',
    teacherName: '{{teacherName}}',
    avgScore: '90.1',
    comments: "Sample comments about the lead's performance...",
  };

  const brandLogoUrl = getConfig('BRAND_LOGO_URL');
  const brandName = getConfig('BRAND_NAME');
  const brandLocation = getConfig('BRAND_LOCATION');
  const brandPhone = getConfig('BRAND_PHONE_NUMBER');
  const emailTitle = getConfig('LEAD_EMAIL_TITLE');
  const emailGreeting = getConfig('LEAD_EMAIL_GREETING');
  const tableHeaderComments = getConfig('LEAD_EMAIL_TABLE_HEADER_COMMENTS');
  const tableHeaderScore = getConfig('LEAD_EMAIL_TABLE_HEADER_SCORE');
  const tableScoreScale = getConfig('LEAD_EMAIL_TABLE_SCORE_SCALE');
  const emailFooter = getConfig('LEAD_EMAIL_FOOTER');
  const signatureTitle = getConfig('LEAD_EMAIL_SIGNATURE_TITLE');
  const signatureName = getConfig('LEAD_EMAIL_SIGNATURE_NAME');
  const emptyCommentsPlaceholder =
    getConfig('LEAD_EMAIL_EMPTY_COMMENTS') ||
    '...........................................................';
  const emptyScorePlaceholder = getConfig('LEAD_EMAIL_EMPTY_SCORE') || '...';

  // Check for missing required configs
  const missingConfigs = [];
  if (showMissingConfigWarning) {
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
  }

  if (showMissingConfigWarning && missingConfigs.length > 0) {
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
          <ul className="list-inside list-disc space-y-1 text-muted-foreground text-sm">
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

  const previewContent = (
    <div
      className={`h-full rounded-lg border p-4 ${theme === 'dark' ? 'text-foreground' : 'text-black'} md:p-12 print:h-auto print:rounded-none print:border-0 print:bg-white print:p-8 print:text-black`}
    >
      {/* Header with Logo and Brand Info */}
      <div className="flex items-center justify-between gap-8">
        {brandLogoUrl && (
          <>
            {/* biome-ignore lint/performance/noImgElement: external branding image */}
            <img
              src={brandLogoUrl}
              alt="logo"
              // onLoad={() => setIsLogoLoaded(true)}
            />
          </>
        )}

        <div className="text-center">
          {brandName && (
            <div className="text-center font-bold text-xlTh">{brandName}</div>
          )}

          {brandLocation && (
            <div className="whitespace-pre-wrap text-wrap text-center font-semibold text-sm">
              {brandLocation}
            </div>
          )}

          {brandPhone && (
            <div className="flex flex-wrap items-center justify-center gap-2 break-keep text-center font-semibold text-sm print:gap-2">
              {brandPhone}
            </div>
          )}
        </div>
      </div>
      {(!!brandName || !!brandLocation || !!brandPhone) && (
        <Separator className="my-4" />
      )}

      {/* Main Content */}
      <div className="p-3">
        {/* Title */}
        {emailTitle && (
          <div className="text-center font-bold text-2xl text-blue-700 uppercase tracking-wide">
            {emailTitle}
          </div>
        )}

        {/* Greeting */}
        {emailGreeting && (
          <div
            className={`mt-2 whitespace-pre-wrap text-left text-sm ${theme === 'dark' ? 'text-foreground' : 'text-black'} print:text-black`}
          >
            {parseDynamicText(emailGreeting)}
          </div>
        )}

        {/* Table */}
        <div className="mt-6">
          <table className="w-full border-collapse border border-black">
            <thead>
              <tr>
                <th className="border border-black bg-gray-50 p-3 text-center font-bold text-sm uppercase">
                  {tableHeaderComments || null}
                </th>
                <th className="border border-black bg-gray-50 p-3 text-center font-bold text-sm">
                  {tableHeaderScore || null}
                  {tableScoreScale && (
                    <div className="mt-1 font-normal text-xs normal-case">
                      {parseDynamicText(tableScoreScale)}
                    </div>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-black p-4 align-top">
                  <div className="min-h-[200px] text-justify text-sm leading-relaxed">
                    {typeof sampleData.comments === 'string' &&
                    sampleData.comments
                      ? sampleData.comments
                      : emptyCommentsPlaceholder}
                  </div>
                </td>
                <td className="border border-black p-4 text-center align-top">
                  <div className="min-h-[200px] text-sm">
                    {sampleData.avgScore !== undefined &&
                    sampleData.avgScore !== null
                      ? sampleData.avgScore
                      : emptyScorePlaceholder}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {emailFooter && (
          <div
            className={`mt-4 whitespace-pre-wrap text-left text-sm ${theme === 'dark' ? 'text-foreground' : 'text-black'} print:text-black`}
          >
            {parseDynamicText(emailFooter)}
          </div>
        )}

        {/* Signature */}
        {(signatureTitle || signatureName) && (
          <div className="mt-8 text-center">
            {signatureTitle && (
              <div className="font-semibold text-sm italic">
                {signatureTitle}
              </div>
            )}
            {signatureName && (
              <div className="font-bold text-sm">{signatureName}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (showCard) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Lead Generation Email Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            {previewContent}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="overflow-x-auto xl:flex-none">
      <div
        id="printable-area"
        className={`h-[297mm] w-[210mm] max-w-full flex-none rounded-xl ${theme === 'dark' ? 'bg-foreground/10' : 'bg-white'} mx-auto print:m-0 print:h-auto print:w-auto print:max-w-none print:rounded-none print:border-0 print:p-4 print:shadow-none`}
      >
        {previewContent}
      </div>
    </div>
  );
}
